import { describe, expect, it } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import { attachDatabase, attachUser } from '../src/lib/auth-context.js';
import { ApiError, errorResponse } from '../src/lib/http.js';
import { authRouter } from '../src/modules/auth/auth.routes.js';
import { researchRouter } from '../src/modules/research/research.routes.js';
import { eventsRouter } from '../src/modules/events/events.routes.js';
import { EVENTS_DISCLAIMER } from '../src/modules/events/events.repo.js';
import { insert, run } from '../src/db/sql.js';
import { competitionFileSchema } from '../src/seed/schemas.js';
import { freshDb, registerUser, makeStaff, authHeader, request, insertTopicFixture } from './helpers.js';

type Db = ReturnType<typeof freshDb>;

// Mirrors createApp's middleware chain so these routers can be exercised before the lead's
// src/routes.ts mount lands (and keep working if the mount moves).
function makeResearchApp(db: Db) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(attachDatabase(db));
  app.use(attachUser);
  app.use('/api/auth', authRouter);
  app.use('/api/research', researchRouter);
  app.use('/api/events', eventsRouter);
  app.use((_req, _res, next) => next(ApiError.notFound('no route')));
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const { status, body } = errorResponse(err);
    if (status >= 500) console.error('[test-error]', req.path, err);
    if (!res.headersSent) res.status(status).json(body);
  });
  return app;
}

type PaperInput = {
  slug: string;
  title: string;
  type?: string;
  year?: number | null;
  status?: string;
  authors?: string;
  description?: string;
  difficulty?: string;
  sourceName?: string;
  verified?: boolean;
};

function addPaper(db: Db, input: PaperInput): number {
  const now = new Date().toISOString();
  return insert(
    db,
    `INSERT INTO resources (slug, title, description, type, url, authors, publisher, published_year, source_name,
        difficulty, est_minutes, verified, status, created_at, updated_at)
     VALUES (@slug, @title, @description, @type, @url, @authors, @publisher, @year, @sourceName, @difficulty, 25,
        @verified, @status, @now, @now)`,
    {
      slug: input.slug,
      title: input.title,
      description: input.description ?? `${input.title} abstract.`,
      type: input.type ?? 'paper',
      url: `https://arxiv.org/abs/${input.slug}`,
      authors: input.authors ?? 'Doe, Roe',
      publisher: 'Test Publisher',
      year: input.year === undefined ? 2024 : input.year,
      sourceName: input.sourceName ?? `arXiv:${input.slug}`,
      difficulty: input.difficulty ?? 'intermediate',
      verified: input.verified === undefined ? 0 : input.verified ? 1 : 0,
      status: input.status ?? 'published',
      now
    }
  );
}

function linkTopic(db: Db, resourceId: number, topicId: number) {
  run(db, 'INSERT INTO resource_topics (resource_id, topic_id) VALUES (@r, @t)', { r: resourceId, t: topicId });
}

function addMilestone(
  db: Db,
  input: { occurredOn: string; title: string; kind?: string; topicId?: number | null; sourceName?: string; url?: string | null }
): number {
  return insert(
    db,
    `INSERT INTO milestones (occurred_on, title, summary, kind, url, source_name, topic_id, created_at)
     VALUES (@occurredOn, @title, @summary, @kind, @url, @sourceName, @topicId, @createdAt)`,
    {
      occurredOn: input.occurredOn,
      title: input.title,
      summary: `${input.title} summary.`,
      kind: input.kind ?? 'development',
      url: input.url === undefined ? `https://example.com/${input.kind ?? 'development'}` : input.url,
      sourceName: input.sourceName ?? 'ACM History',
      topicId: input.topicId ?? null,
      createdAt: new Date().toISOString()
    }
  );
}

function addEvent(
  db: Db,
  input: {
    slug: string;
    name?: string;
    type?: string;
    status?: string;
    difficulty?: string;
    organizer?: string;
    summary?: string;
    skills?: string;
    start?: string | null;
    deadline?: string | null;
    topicIds?: number[];
  }
): number {
  const now = new Date().toISOString();
  const id = insert(
    db,
    `INSERT INTO competitions (slug, name, organizer, type, url, summary, requirements, skills_practiced,
        difficulty, start_date, deadline_date, location, status, is_live_data, source_updated_at, created_at, updated_at)
     VALUES (@slug, @name, @organizer, @type, @url, @summary, @requirements, @skills, @difficulty, @start, @deadline,
        'Online', @status, 1, @sourceUpdatedAt, @now, @now)`,
    {
      slug: input.slug,
      name: input.name ?? input.slug,
      organizer: input.organizer ?? 'Test Organizer',
      type: input.type ?? 'competition',
      url: `https://example.com/${input.slug}`,
      summary: input.summary ?? `${input.slug} summary.`,
      requirements: 'Register before the deadline.',
      skills: input.skills ?? 'data cleaning, model tuning',
      difficulty: input.difficulty ?? 'intermediate',
      start: input.start ?? null,
      deadline: input.deadline ?? null,
      status: input.status ?? 'open',
      sourceUpdatedAt: now,
      now
    }
  );
  for (const topicId of input.topicIds ?? []) {
    run(db, 'INSERT INTO competition_topics (competition_id, topic_id) VALUES (@c, @t)', { c: id, t: topicId });
  }
  return id;
}

function addCurated(
  db: Db,
  kind: string,
  slug: string,
  orderIndex: number,
  resourceIds: Array<{ id: number; position: number; note?: string }>
): number {
  const now = new Date().toISOString();
  const id = insert(
    db,
    `INSERT INTO curated_collections (slug, title, description, kind, order_index, created_at, updated_at)
     VALUES (@slug, @slug, 'curated list', @kind, @orderIndex, @now, @now)`,
    { slug, kind, orderIndex, now }
  );
  for (const item of resourceIds) {
    run(db, `INSERT INTO curated_collection_items (collection_id, resource_id, position, note) VALUES (@c, @r, @p, @n)`, {
      c: id,
      r: item.id,
      p: item.position,
      n: item.note ?? ''
    });
  }
  return id;
}

/** Days from now, formatted the way the calendar compares them. */
function day(offset: number): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
}

describe('research: areas', () => {
  it('derives areas from the taxonomy with published-only corpus counts', async () => {
    const db = freshDb();
    const app = makeResearchApp(db);
    const topicId = insertTopicFixture(db, { slug: 'radiomics', name: 'Radiomics' });
    const live = addPaper(db, { slug: 'area-live', title: 'Live Paper' });
    const draft = addPaper(db, { slug: 'area-draft', title: 'Draft Paper', status: 'draft' });
    const extra = addPaper(db, { slug: 'area-extra', title: 'Extra Paper' });
    linkTopic(db, live, topicId);
    linkTopic(db, draft, topicId);
    linkTopic(db, extra, topicId);

    const res = await request(app).get('/api/research/topics');
    expect(res.status).toBe(200);
    const area = res.body.areas.find((a: { slug: string }) => a.slug === 'test-sub');
    expect(area).toMatchObject({
      slug: 'test-sub',
      name: 'Test Subdomain',
      domainSlug: expect.any(String),
      domainName: expect.any(String),
      topicCount: 1
    });
    expect(area.resourceCount).toBe(2); // draft excluded, unlinked-but-published counted
    expect(res.body.areas.every((a: { topicCount: number }) => typeof a.topicCount === 'number')).toBe(true);
  });
});

describe('research: papers', () => {
  it('shows only published papers and surveys, with attribution kept verbatim', async () => {
    const db = freshDb();
    const app = makeResearchApp(db);
    addPaper(db, { slug: 'p-1', title: 'Scaling Laws', type: 'paper', year: 2020, authors: 'Kaplan, Smith', verified: true });
    addPaper(db, { slug: 'p-2', title: 'A Survey of Surveys', type: 'survey', year: 2023 });
    addPaper(db, { slug: 'p-3', title: 'Some Book', type: 'book', year: 2016 });
    addPaper(db, { slug: 'p-4', title: 'Tutorial Page', type: 'tutorial', year: 2021 });
    addPaper(db, { slug: 'p-5', title: 'Hidden Draft', type: 'paper', year: 2025, status: 'draft' });

    const anon = await request(app).get('/api/research/papers');
    expect(anon.status).toBe(200);
    expect(anon.body.papers.map((p: { slug: string }) => p.slug)).toEqual(['p-2', 'p-1']); // newest first
    expect(anon.body.total).toBe(2);

    const staff = await makeStaff(app, db, 'research-staff@example.com', 'admin');
    const staffView = await request(app).get('/api/research/papers').set(authHeader(staff));
    expect(staffView.body.papers.map((p: { slug: string }) => p.slug)).toEqual(['p-2', 'p-1']); // drafts never leak here

    const first = anon.body.papers[0];
    expect(first).toMatchObject({
      slug: 'p-2',
      type: 'survey',
      year: 2023,
      authors: 'Doe, Roe',
      publisher: 'Test Publisher',
      url: 'https://arxiv.org/abs/p-2',
      sourceName: 'arXiv:p-2',
      verified: false
    });
    expect(anon.body.papers[1].verified).toBe(true);
  });

  it('filters by topic, year and free text, and sorts nulls last', async () => {
    const db = freshDb();
    const app = makeResearchApp(db);
    const topicId = insertTopicFixture(db, { slug: 'attention', name: 'Attention' });
    const t1 = addPaper(db, { slug: 'f-1', title: 'Attention Mechanics', year: 2017, authors: 'Vaswani' });
    addPaper(db, { slug: 'f-2', title: 'Efficient Fine-Tuning', year: 2019, description: 'Nothing to do with attention.' });
    const t3 = addPaper(db, { slug: 'f-3', title: 'Zettabyte Attention', type: 'survey', year: null });
    addPaper(db, { slug: 'f-4', title: 'Sparse Models, 20% Pruning', year: 2018 });
    linkTopic(db, t1, topicId);
    linkTopic(db, t3, topicId);

    const byTopic = await request(app).get('/api/research/papers?topic=attention');
    expect(byTopic.body.papers.map((p: { slug: string }) => p.slug)).toEqual(['f-1', 'f-3']); // newest first, undated last

    const byYear = await request(app).get('/api/research/papers?year=2017');
    expect(byYear.body.papers.map((p: { slug: string }) => p.slug)).toEqual(['f-1']);

    const byAuthor = await request(app).get('/api/research/papers?q=vaswani');
    expect(byAuthor.body.total).toBe(1);
    const byLiteralPercent = await request(app).get('/api/research/papers?q=%25');
    expect(byLiteralPercent.body.papers.map((p: { slug: string }) => p.slug)).toEqual(['f-4']); // % is a character, not a wildcard
    const byDescription = await request(app).get('/api/research/papers?q=do%20with');
    expect(byDescription.body.papers.map((p: { slug: string }) => p.slug)).toEqual(['f-2']);

    const oldest = await request(app).get('/api/research/papers?sort=oldest');
    expect(oldest.body.papers.map((p: { slug: string }) => p.slug)).toEqual(['f-1', 'f-4', 'f-2', 'f-3']);
    const title = await request(app).get('/api/research/papers?sort=title');
    expect(title.body.papers.map((p: { slug: string }) => p.slug)).toEqual(['f-1', 'f-2', 'f-4', 'f-3']);

    const badSort = await request(app).get('/api/research/papers?sort=relevance');
    expect(badSort.status).toBe(422);
  });

  it('paginates and refuses oversized pages', async () => {
    const db = freshDb();
    const app = makeResearchApp(db);
    for (let i = 0; i < 5; i++) addPaper(db, { slug: `pg-${i}`, title: `Paper ${i}`, year: 2000 + i });

    const page2 = await request(app).get('/api/research/papers?page=2&perPage=2');
    expect(page2.body.papers.map((p: { slug: string }) => p.slug)).toEqual(['pg-2', 'pg-1']);
    expect(page2.body).toMatchObject({ page: 2, perPage: 2, total: 5, totalPages: 3 });

    const beyond = await request(app).get('/api/research/papers?page=99');
    expect(beyond.status).toBe(200);
    expect(beyond.body.papers).toEqual([]);
    expect(beyond.body.total).toBe(5);

    const tooBig = await request(app).get('/api/research/papers?perPage=500');
    expect(tooBig.status).toBe(422);
  });
});

describe('research: milestones', () => {
  it('labels the list as curated in the payload and on every row', async () => {
    const db = freshDb();
    const app = makeResearchApp(db);
    const topicId = insertTopicFixture(db, { slug: 'transformers', name: 'Transformers' });
    addMilestone(db, { occurredOn: '2017-06', title: 'Attention Is All You Need', kind: 'paper', topicId });
    addMilestone(db, { occurredOn: '2020', title: 'A model ships', kind: 'model' });
    addMilestone(db, { occurredOn: '2022-11-30', title: 'A product launches', kind: 'product' });

    const res = await request(app).get('/api/research/milestones');
    expect(res.status).toBe(200);
    expect(res.body.isCurated).toBe(true);
    expect(res.body.milestones.map((m: { title: string }) => m.title)).toEqual([
      'A product launches',
      'A model ships',
      'Attention Is All You Need'
    ]); // occurred_on DESC
    expect(res.body.milestones.every((m: { isCurated: boolean }) => m.isCurated === true)).toBe(true);
    expect(res.body.milestones[0]).toMatchObject({ kind: 'product', sourceName: 'ACM History', topicSlug: null });
    const paper = res.body.milestones[2];
    expect(paper).toMatchObject({ occurredOn: '2017-06', topicSlug: 'transformers', topicName: 'Transformers' });
    expect(paper.curatedAt).toBeTruthy();
  });

  it('filters by year prefix and kind, and clamps limit without failing', async () => {
    const db = freshDb();
    const app = makeResearchApp(db);
    for (let i = 0; i < 3; i++) addMilestone(db, { occurredOn: `2021-0${i + 1}`, title: `Entry ${i}`, kind: 'development' });
    addMilestone(db, { occurredOn: '2022-01', title: 'Later', kind: 'model' });

    const byYear = await request(app).get('/api/research/milestones?year=2021');
    expect(byYear.body.milestones).toHaveLength(3);

    const byKind = await request(app).get('/api/research/milestones?kind=model');
    expect(byKind.body.milestones.map((m: { title: string }) => m.title)).toEqual(['Later']);

    const limited = await request(app).get('/api/research/milestones?limit=2');
    expect(limited.body.milestones).toHaveLength(2);
    const clampedHigh = await request(app).get('/api/research/milestones?limit=5000');
    expect(clampedHigh.body.milestones).toHaveLength(4);
    const clampedLow = await request(app).get('/api/research/milestones?limit=0');
    expect(clampedLow.body.milestones).toHaveLength(1);
    const junk = await request(app).get('/api/research/milestones?limit=abc');
    expect(junk.body.milestones).toHaveLength(4); // falls back to the default
  });
});

describe('research: must-reads', () => {
  it('returns the top collection per kind with ordered items and draft rules', async () => {
    const db = freshDb();
    const app = makeResearchApp(db);
    const first = addPaper(db, { slug: 'mr-1', title: 'First Must Read', year: 2017 });
    const second = addPaper(db, { slug: 'mr-2', title: 'Second Must Read', year: 2020 });
    const draft = addPaper(db, { slug: 'mr-3', title: 'Draft Must Read', status: 'draft' });
    addCurated(db, 'must-read', 'later-list', 5, [{ id: first, position: 0 }]);
    addCurated(db, 'must-read', 'top-list', 1, [
      { id: second, position: 1, note: 'second' },
      { id: first, position: 0, note: 'read first' },
      { id: draft, position: 2, note: 'unpublished' }
    ]);
    addCurated(db, 'frontier', 'frontier-list', 0, [{ id: second, position: 0 }]);

    const anon = await request(app).get('/api/research/must-reads');
    expect(anon.status).toBe(200);
    expect(anon.body.mustRead).toMatchObject({ slug: 'top-list', kind: 'must-read', itemCount: 2 });
    expect(anon.body.mustRead.items.map((i: { slug: string }) => i.slug)).toEqual(['mr-1', 'mr-2']);
    expect(anon.body.mustRead.items[0].note).toBe('read first');
    expect(anon.body.frontier.slug).toBe('frontier-list');

    const learner = await registerUser(app, { email: 'mr-learner@example.com' });
    const learnerView = await request(app).get('/api/research/must-reads').set(authHeader(learner));
    expect(learnerView.body.mustRead.itemCount).toBe(2);

    const staff = await makeStaff(app, db, 'mr-staff@example.com', 'author');
    const staffView = await request(app).get('/api/research/must-reads').set(authHeader(staff));
    expect(staffView.body.mustRead.itemCount).toBe(3);
  });

  it('answers null when a kind has no collection', async () => {
    const db = freshDb();
    const app = makeResearchApp(db);
    const res = await request(app).get('/api/research/must-reads');
    expect(res.body).toEqual({ mustRead: null, frontier: null });
  });
});

describe('events: list', () => {
  it('repeats the disclaimer and marks every row as not live data', async () => {
    const db = freshDb();
    const app = makeResearchApp(db);
    addEvent(db, { slug: 'ev-open', status: 'open', deadline: day(10) });
    addEvent(db, { slug: 'ev-closed', status: 'closed', deadline: day(-5) });

    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    expect(res.body.isLiveData).toBe(false);
    expect(res.body.disclaimer).toBe(EVENTS_DISCLAIMER);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0]).toMatchObject({ slug: 'ev-open', isLiveData: false });
    expect(res.body.events[0].sourceUpdatedAt).toBeTruthy();
    expect(res.body.events[0].skillsPracticed).toEqual(['data cleaning', 'model tuning']);

    const all = await request(app).get('/api/events?status=all');
    expect(all.body.total).toBe(2);
    const closed = await request(app).get('/api/events?status=closed');
    expect(closed.body.events.map((e: { slug: string }) => e.slug)).toEqual(['ev-closed']);
  });

  it('orders by status group first: open, recurring, ongoing, upcoming, closed last', async () => {
    const db = freshDb();
    const app = makeResearchApp(db);
    addEvent(db, { slug: 'o-closed', status: 'closed', deadline: day(1) });
    addEvent(db, { slug: 'o-upcoming', status: 'upcoming', start: day(2) });
    addEvent(db, { slug: 'o-open-dated', status: 'open', deadline: day(30) });
    addEvent(db, { slug: 'o-open-soon', status: 'open', deadline: day(3) });
    addEvent(db, { slug: 'o-recurring', status: 'recurring' });
    addEvent(db, { slug: 'o-ongoing', status: 'ongoing', start: day(-1), deadline: day(20) });
    addEvent(db, { slug: 'o-upcoming-undated', status: 'upcoming' });

    const res = await request(app).get('/api/events?status=all&perPage=100');
    expect(res.body.events.map((e: { slug: string }) => e.slug)).toEqual([
      'o-open-soon',
      'o-open-dated',
      'o-recurring',
      'o-ongoing',
      'o-upcoming',
      'o-upcoming-undated',
      'o-closed'
    ]); // undated entries sink inside their own group, never past a live one
  });

  it('filters by type, difficulty and text with validated values', async () => {
    const db = freshDb();
    const app = makeResearchApp(db);
    addEvent(db, { slug: 'ft-1', name: 'Image Net Race', type: 'competition', difficulty: 'advanced', organizer: 'Kaggle Inc' });
    addEvent(db, { slug: 'ft-2', name: 'Local Meetup', type: 'hackathon', difficulty: 'beginner' });

    const byType = await request(app).get('/api/events?type=hackathon');
    expect(byType.body.events.map((e: { slug: string }) => e.slug)).toEqual(['ft-2']);
    const byDiff = await request(app).get('/api/events?difficulty=advanced');
    expect(byDiff.body.total).toBe(1);
    const byQ = await request(app).get('/api/events?q=kaggle');
    expect(byQ.body.events.map((e: { slug: string }) => e.slug)).toEqual(['ft-1']);
    const allTypes = await request(app).get('/api/events?type=all');
    expect(allTypes.body.total).toBe(2);

    const badType = await request(app).get('/api/events?type=regatta');
    expect(badType.status).toBe(422);
    const badStatus = await request(app).get('/api/events?status=finished');
    expect(badStatus.status).toBe(422);
    const bigPage = await request(app).get('/api/events?perPage=500');
    expect(bigPage.status).toBe(422);
  });

  it('paginates the list', async () => {
    const db = freshDb();
    const app = makeResearchApp(db);
    for (let i = 0; i < 5; i++) addEvent(db, { slug: `pg-ev-${i}`, status: 'open', deadline: day(i + 1) });
    const res = await request(app).get('/api/events?page=2&perPage=2');
    expect(res.body).toMatchObject({ page: 2, perPage: 2, total: 5, totalPages: 3 });
    expect(res.body.events).toHaveLength(2);
  });
});

describe('events: calendar', () => {
  it('windows by days, groups by month and skips closed editions', async () => {
    const db = freshDb();
    const app = makeResearchApp(db);
    addEvent(db, { slug: 'cal-soon', status: 'open', deadline: day(2), start: day(-4) });
    addEvent(db, { slug: 'cal-start-only', status: 'upcoming', start: day(200) });
    addEvent(db, { slug: 'cal-far', status: 'open', deadline: day(400) });
    addEvent(db, { slug: 'cal-closed', status: 'closed', deadline: day(2) });

    const near = await request(app).get('/api/events/calendar?days=120');
    expect(near.status).toBe(200);
    expect(near.body.days).toBe(120);
    expect(near.body.isLiveData).toBe(false);
    expect(near.body.disclaimer).toBe(EVENTS_DISCLAIMER);
    const slugs = near.body.months.flatMap((m: { items: { slug: string }[] }) => m.items.map((i) => i.slug));
    expect(slugs).toEqual(['cal-soon']); // 200d start and 400d deadline are outside the window; closed excluded
    expect(near.body.from).toBe(day(0));
    expect(near.body.to).toBe(day(120));
    for (const month of near.body.months) {
      expect(month.month).toMatch(/^\d{4}-\d{2}$/);
      expect(month.label).toBeTruthy();
    }

    const wide = await request(app).get('/api/events/calendar?days=730');
    const wideSlugs = wide.body.months.flatMap((m: { items: { slug: string }[] }) => m.items.map((i) => i.slug));
    expect(wideSlugs).toEqual(['cal-soon', 'cal-start-only', 'cal-far']);

    const clamped = await request(app).get('/api/events/calendar?days=1');
    expect(clamped.body.days).toBe(7);
    const clampHigh = await request(app).get('/api/events/calendar?days=9999');
    expect(clampHigh.body.days).toBe(730);
  });

  it('keeps /calendar ahead of the :slug route and reserves the word in curated data', async () => {
    const db = freshDb();
    const app = makeResearchApp(db);
    addEvent(db, { slug: 'ev-named', name: 'Reachable Event', status: 'open' });

    const res = await request(app).get('/api/events/calendar?days=30');
    expect(res.status).toBe(200);
    expect(res.body.months).toBeDefined();
    expect(res.body.event).toBeUndefined();

    const detail = await request(app).get('/api/events/ev-named');
    expect(detail.body.event.slug).toBe('ev-named');

    // An event slugged "calendar" would be unreachable, so the seeder refuses it outright.
    const base = {
      name: 'Reserved',
      organizer: 'QA',
      type: 'competition',
      url: 'https://example.com/reserved',
      summary: 'summary'
    };
    expect(competitionFileSchema.safeParse({ ...base, slug: 'calendar' }).success).toBe(false);
    expect(competitionFileSchema.safeParse({ ...base, slug: 'Kaggle Competitions' }).success).toBe(false);
    expect(competitionFileSchema.safeParse({ ...base, slug: 'kaggle-competitions' }).success).toBe(true);
  });
});

describe('events: detail', () => {
  it('returns related published topics, null dates and the 404 for unknown slugs', async () => {
    const db = freshDb();
    const app = makeResearchApp(db);
    const topicId = insertTopicFixture(db, { slug: 'conv-nets', name: 'Convolutional Networks' });
    const hiddenTopic = insertTopicFixture(db, { slug: 'hidden-topic', name: 'Hidden Topic' });
    run(db, `UPDATE topics SET status = 'draft' WHERE slug = 'hidden-topic'`);
    addEvent(db, {
      slug: 'detail-ev',
      name: 'Detail Event',
      status: 'recurring',
      type: 'challenge',
      skills: 'data cleaning; model tuning',
      topicIds: [topicId, hiddenTopic]
    });

    const res = await request(app).get('/api/events/detail-ev');
    expect(res.status).toBe(200);
    expect(res.body.isLiveData).toBe(false);
    expect(res.body.event).toMatchObject({ slug: 'detail-ev', type: 'challenge', status: 'recurring' });
    expect(res.body.event.startDate).toBeNull();
    expect(res.body.event.deadlineDate).toBeNull();
    expect(res.body.event.skillsPracticed).toEqual(['data cleaning', 'model tuning']);
    expect(res.body.event.relatedTopics.map((t: { slug: string }) => t.slug)).toEqual(['conv-nets']);

    const missing = await request(app).get('/api/events/no-such-event');
    expect(missing.status).toBe(404);
    expect(missing.body.error.message).toContain('no-such-event');
  });
});
