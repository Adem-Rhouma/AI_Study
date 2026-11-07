import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { encryptSecret, secretHint } from '../src/lib/crypto.js';
import { get, insert, run } from '../src/db/sql.js';
import { preferencesSchema, savePreferences } from '../src/modules/auth/auth.repo.js';
import { assistantLimiter } from '../src/modules/ai/ai.routes.js';
import {
  authHeader,
  freshDb,
  insertTopicFixture,
  makeApp,
  registerUser,
  request,
  seedLessonWithTopic,
  type TestUser
} from './helpers.js';

type Captured = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

/** Everything the module does to the outside world goes through here; no test reaches a real provider. */
function stubFetch(respond: (call: Captured) => Response) {
  const calls: Captured[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init: unknown) => {
      const options = (init ?? {}) as { headers?: Record<string, string>; body?: string };
      const call: Captured = {
        url: String(url),
        headers: options.headers ?? {},
        body: options.body ? JSON.parse(options.body) : {}
      };
      calls.push(call);
      return respond(call);
    })
  );
  return calls;
}

function openAiReply(text: string) {
  return () => jsonResponse({ choices: [{ message: { content: text } }] });
}

function addProvider(
  db: Database,
  input: {
    name: string;
    adapter?: 'openai_compatible' | 'anthropic' | 'ollama';
    baseUrl?: string;
    model?: string;
    apiKey?: string | null;
    ciphertext?: string;
    isEnabled?: boolean;
    priority?: number;
  }
): number {
  const now = new Date().toISOString();
  const apiKey = input.apiKey === undefined || input.apiKey === null ? 'sk-proj-SECRET-1234' : input.apiKey;
  return insert(
    db,
    `INSERT INTO ai_providers (name, adapter, base_url, model, api_key_ciphertext, api_key_hint, is_enabled, priority,
        temperature, max_tokens, timeout_ms, created_at, updated_at)
     VALUES (@name, @adapter, @baseUrl, @model, @ciphertext, @hint, @isEnabled, @priority, 0.2, 500, 15000, @now, @now)`,
    {
      name: input.name,
      adapter: input.adapter ?? 'openai_compatible',
      baseUrl: input.baseUrl ?? 'https://provider.test/v1',
      model: input.model ?? 'test-model',
      // A null key means "no key stored"; a plain string is encrypted the way the console would.
      ciphertext: input.ciphertext ?? (apiKey === '' ? '' : encryptSecret(apiKey)),
      hint: secretHint(apiKey),
      isEnabled: input.isEnabled === false ? 0 : 1,
      priority: input.priority ?? 0,
      now
    }
  );
}

function usageTotals(db: Database) {
  return get<{ c: number; failures: number }>(
    db,
    'SELECT COUNT(*) AS c, SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failures FROM ai_usage'
  );
}

function sentText(body: Record<string, unknown>): string {
  return JSON.stringify(body.messages ?? []);
}

let db: Database.Database;
let app: ReturnType<typeof makeApp>;
let learner: TestUser;

beforeEach(async () => {
  db = freshDb();
  app = makeApp(db);
  // The window is process-wide and keyed by account id; every test starts from an empty one.
  assistantLimiter.reset();
  learner = await registerUser(app, { email: 'ai-learner@example.com' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ai: status', () => {
  it('says plainly that the assistant is off when nothing is configured', async () => {
    const anon = await request(app).get('/api/ai/status');
    expect(anon.status).toBe(200);
    expect(anon.body.configured).toBe(false);
    expect(anon.body.provider).toBeNull();
    expect(anon.body.note).toMatch(/AI_PROVIDER/);
    expect(anon.body.usage).toBeNull();
  });

  it('reports the enabled provider without ever leaking its key', async () => {
    addProvider(db, { name: 'primary', model: 'gpt-test' });
    const res = await request(app).get('/api/ai/status').set(authHeader(learner));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      configured: true,
      enabledForUser: true,
      provider: { name: 'primary', adapter: 'openai_compatible', model: 'gpt-test', source: 'database' }
    });
    expect(res.body.note).toBe('');
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch('sk-proj-SECRET');
    // The hint stays server-side: a learner has no reason to see the tail of an admin key.
    expect(text).not.toMatch('••••');
  });

  it('picks the lowest-priority enabled row and ignores disabled ones', async () => {
    addProvider(db, { name: 'backup', priority: 5, model: 'backup-model' });
    addProvider(db, { name: 'off', priority: 1, model: 'off-model', isEnabled: false });
    addProvider(db, { name: 'main', priority: 2, model: 'main-model' });
    const res = await request(app).get('/api/ai/status');
    expect(res.body.provider).toMatchObject({ name: 'main', model: 'main-model' });
  });

  it('skips a row whose stored key cannot be decrypted instead of failing the request', async () => {
    // Ciphertext produced under a different app secret: garbage to this install.
    addProvider(db, { name: 'broken', ciphertext: Buffer.from('not-a-real-gcm-payload').toString('base64') });
    const res = await request(app).get('/api/ai/status');
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
  });

  it('treats a keyless row that needs a key as unconfigured', async () => {
    addProvider(db, { name: 'keyless', apiKey: '' });
    const calls = stubFetch(openAiReply('should not be reached'));
    const res = await request(app).post('/api/ai/ask').set(authHeader(learner)).send({ question: 'Any question here?' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('ai_not_configured');
    expect(calls.length).toBe(0);
  });
});

describe('ai: asking', () => {
  it('requires a session', async () => {
    addProvider(db, { name: 'primary' });
    const res = await request(app).post('/api/ai/ask').send({ question: 'What is attention?' });
    expect(res.status).toBe(401);
  });

  it('refuses with 503 and writes nothing when no provider is configured', async () => {
    const res = await request(app).post('/api/ai/ask').set(authHeader(learner)).send({ question: 'What is attention?' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('ai_not_configured');
    expect(get<{ c: number }>(db, 'SELECT COUNT(*) AS c FROM ai_conversations')?.c).toBe(0);
    expect(usageTotals(db)?.c).toBe(0);
  });

  it('validates the question before touching a provider', async () => {
    addProvider(db, { name: 'primary' });
    const calls = stubFetch(openAiReply('x'));
    const short = await request(app).post('/api/ai/ask').set(authHeader(learner)).send({ question: '  ' });
    expect(short.status).toBe(422);
    const unknown = await request(app)
      .post('/api/ai/ask')
      .set(authHeader(learner))
      .send({ question: 'Why?', context: { kind: 'topic', slug: 'no-such-topic' } });
    expect(unknown.status).toBe(404);
    expect(calls.length).toBe(0);
  });

  it('grounds a lesson thread in the lesson text, persists the turn, and counts usage', async () => {
    const topicId = insertTopicFixture(db, { slug: 'attention' });
    const { lessonId } = seedLessonWithTopic(db, { lessonSlug: 'attention-lesson', topicId });
    run(
      db,
      `INSERT INTO lesson_blocks (lesson_id, order_index, type, text, payload, created_at, updated_at)
       VALUES (@l, 1, 'prose', 'The softmax weights show how much each token attends to each other token.', '{}', @now, @now)`,
      { l: lessonId, now: new Date().toISOString() }
    );
    addProvider(db, { name: 'primary', model: 'gpt-test' });

    const calls = stubFetch(() =>
      jsonResponse({
        model: 'gpt-test-2026',
        choices: [{ message: { content: 'Attention is a weighted sum over tokens.' } }],
        usage: { prompt_tokens: 120, completion_tokens: 34 }
      })
    );

    const res = await request(app)
      .post('/api/ai/ask')
      .set(authHeader(learner))
      .send({ question: 'How do I read the attention matrix?', context: { kind: 'lesson', slug: 'attention-lesson' } });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatchObject({
      role: 'assistant',
      content: 'Attention is a weighted sum over tokens.',
      model: 'gpt-test-2026',
      error: null
    });
    expect(res.body.conversation).toMatchObject({
      title: 'How do I read the attention matrix?',
      messageCount: 2,
      context: { kind: 'lesson', slug: 'attention-lesson', title: 'Fixture Lesson' }
    });

    const call = calls[0];
    expect(call.url).toBe('https://provider.test/v1/chat/completions');
    expect(call.headers.authorization).toBe('Bearer sk-proj-SECRET-1234');
    expect(call.body.model).toBe('gpt-test');
    expect(call.body.max_tokens).toBe(500);
    expect(call.body.temperature).toBe(0.2);
    const systemText = (call.body.messages as { role: string; content: string }[])
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n');
    expect(systemText).toMatch('The softmax weights show how much each token attends');
    expect(systemText).toMatch(/Never invent citations/);

    expect(get<{ c: number }>(db, 'SELECT COUNT(*) AS c FROM ai_messages WHERE conversation_id = @id', { id: res.body.conversation.id })?.c).toBe(2);
    expect(usageTotals(db)).toMatchObject({ c: 1, failures: 0 });
    expect(
      get<{ tokens_prompt: number; purpose: string }>(db, 'SELECT tokens_prompt, purpose FROM ai_usage LIMIT 1')
    ).toMatchObject({ tokens_prompt: 120, purpose: 'assistant' });
  });

  it('never sends an exercise solution to the provider', async () => {
    const topicId = insertTopicFixture(db, { slug: 'softmax' });
    insert(
      db,
      `INSERT INTO exercises (slug, kind, topic_id, difficulty, points, title, prompt, context, answer_spec, solution,
          explanation, answer_note, status, created_at, updated_at)
       VALUES ('softmax-q', 'numeric', @topicId, 'intermediate', 10, 'Softmax temperature',
          'What does raising the temperature do?', 'Given logits of 1, 2 and 3.', '{}',
          'SOLUTIONMUSTNOTLEAVETHESERVER', 'Because of the denominator.', '', 'published', @now, @now)`,
      { topicId, now: new Date().toISOString() }
    );
    addProvider(db, { name: 'primary' });
    const calls = stubFetch(openAiReply('Think about what the exponent scales.'));

    const res = await request(app)
      .post('/api/ai/ask')
      .set(authHeader(learner))
      .send({ question: 'Hint for the softmax question?', context: { kind: 'exercise', slug: 'softmax-q' } });
    expect(res.status).toBe(200);

    const sent = sentText(calls[0].body);
    expect(sent).toMatch('What does raising the temperature do?');
    expect(sent).not.toMatch('SOLUTIONMUSTNOTLEAVETHESERVER');
    expect(sent).not.toMatch('Because of the denominator.');
  });

  it('keeps a thread on one entry and replays earlier turns', async () => {
    insertTopicFixture(db, { slug: 'attention' });
    addProvider(db, { name: 'primary' });
    const calls = stubFetch(openAiReply('Second answer.'));

    const first = await request(app)
      .post('/api/ai/ask')
      .set(authHeader(learner))
      .send({ question: 'What is attention?', context: { kind: 'topic', slug: 'attention' } });
    const conversationId = first.body.conversation.id;
    expect(first.body.conversation.context).toMatchObject({ kind: 'topic', slug: 'attention', title: 'attention' });

    const second = await request(app)
      .post('/api/ai/ask')
      .set(authHeader(learner))
      .send({ question: 'And in a decoder?', conversationId });
    expect(second.status).toBe(200);
    expect(second.body.conversation.id).toBe(conversationId);
    expect(second.body.conversation.messageCount).toBe(4);

    const roles = (calls[1].body.messages as { role: string }[]).map((m) => m.role);
    expect(roles).toEqual(['system', 'system', 'user', 'assistant', 'user']);
    expect(sentText(calls[1].body)).toMatch('What is attention?');

    const detail = await request(app).get(`/api/ai/conversations/${conversationId}`).set(authHeader(learner));
    expect(detail.body.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(detail.body.conversation.context).toMatchObject({ kind: 'topic', slug: 'attention' });
  });
});

describe('ai: adapters', () => {
  it('speaks the Anthropic dialect: separate system, x-api-key, required max_tokens', async () => {
    addProvider(db, { name: 'claude', adapter: 'anthropic', baseUrl: 'https://claude.test/api/v1', model: 'claude-test' });
    const calls = stubFetch(() =>
      jsonResponse({
        content: [{ type: 'text', text: 'Hello from ' }, { type: 'text', text: 'Anthropic.' }],
        usage: { input_tokens: 10, output_tokens: 5 }
      })
    );

    const res = await request(app).post('/api/ai/ask').set(authHeader(learner)).send({ question: 'Explain KV caching.' });
    expect(res.status).toBe(200);
    expect(res.body.message.content).toBe('Hello from Anthropic.');
    expect(calls[0].url).toBe('https://claude.test/api/v1/messages');
    expect(calls[0].headers['x-api-key']).toBe('sk-proj-SECRET-1234');
    expect(calls[0].body.system).toMatch('study assistant');
    expect(calls[0].body.max_tokens).toBe(500);
    const turns = calls[0].body.messages as { role: string }[];
    expect(turns.map((m) => m.role)).toEqual(['user']);
    expect(get<{ tokens_completion: number }>(db, 'SELECT tokens_completion FROM ai_usage ORDER BY id DESC LIMIT 1')?.tokens_completion).toBe(5);
  });

  it('speaks the Ollama dialect: no key header, /api/chat, stream off', async () => {
    addProvider(db, { name: 'local', adapter: 'ollama', baseUrl: '', model: 'llama3', apiKey: '' });
    const calls = stubFetch(() => jsonResponse({ message: { content: 'Local answer.' }, prompt_eval_count: 44, eval_count: 21 }));

    const res = await request(app).post('/api/ai/ask').set(authHeader(learner)).send({ question: 'And locally?' });
    expect(res.status).toBe(200);
    expect(res.body.message.content).toBe('Local answer.');
    expect(calls[0].url).toBe('http://localhost:11434/api/chat');
    expect(calls[0].headers.authorization).toBeUndefined();
    expect(calls[0].body.stream).toBe(false);
    expect(calls[0].body.options).toMatchObject({ temperature: 0.2, num_predict: 500 });
    expect(get<{ tokens_prompt: number }>(db, 'SELECT tokens_prompt FROM ai_usage ORDER BY id DESC LIMIT 1')?.tokens_prompt).toBe(44);
  });

  it('reports a provider that answers with a shape we cannot read', async () => {
    addProvider(db, { name: 'primary' });
    stubFetch(() => jsonResponse({ nothing: 'useful' }));
    const res = await request(app).post('/api/ai/ask').set(authHeader(learner)).send({ question: 'Any question here?' });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('ai_provider_error');
  });

  it('records a failed turn, keeps the question, and never repeats the key', async () => {
    addProvider(db, { name: 'primary' });
    stubFetch(() => jsonResponse({ error: { message: 'invalid api key sk-proj-SECRET-1234' } }, 401));

    const res = await request(app).post('/api/ai/ask').set(authHeader(learner)).send({ question: 'What is layer norm?' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('ai_provider_auth');
    expect(JSON.stringify(res.body)).not.toMatch('sk-proj-SECRET');

    const failed = get<{ content: string; error: string }>(db, `SELECT content, error FROM ai_messages WHERE role = 'assistant' ORDER BY id DESC LIMIT 1`);
    expect(failed?.content).toBe('');
    expect(failed?.error).toMatch('HTTP 401');
    expect(usageTotals(db)).toMatchObject({ c: 1, failures: 1 });

    // A failed turn stays in the thread but is never replayed as an empty assistant message.
    const failedId = get<{ conversation_id: number }>(db, `SELECT conversation_id FROM ai_messages WHERE role = 'assistant' ORDER BY id DESC LIMIT 1`)!
      .conversation_id;
    const calls = stubFetch(openAiReply('Recovered.'));
    const retry = await request(app)
      .post('/api/ai/ask')
      .set(authHeader(learner))
      .send({ question: 'Try again?', conversationId: failedId });
    expect(retry.status).toBe(200);
    expect(retry.body.conversation.messageCount).toBe(4);
    const turns = calls[0].body.messages as { role: string; content: string }[];
    expect(turns.filter((m) => m.role === 'assistant')).toHaveLength(0);
  });

  it('honours the per-account assistant switch before calling the provider', async () => {
    addProvider(db, { name: 'primary' });
    savePreferences(db, learner.id, preferencesSchema.parse({ aiAssistantEnabled: false }));
    const calls = stubFetch(openAiReply('no'));

    const res = await request(app).post('/api/ai/ask').set(authHeader(learner)).send({ question: 'Anything at all?' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ai_disabled_for_user');
    expect(calls.length).toBe(0);
  });

  it('limits each learner to the configured requests per minute, without touching anyone else', async () => {
    addProvider(db, { name: 'primary' });
    stubFetch(openAiReply('ok'));
    const other = await registerUser(app, { email: 'ai-bystander@example.com' });

    let lastStatus = 0;
    for (let i = 0; i < 21; i += 1) {
      lastStatus = (await request(app).post('/api/ai/ask').set(authHeader(learner)).send({ question: `Question number ${i}?` })).status;
    }
    expect(lastStatus).toBe(429);
    expect((await request(app).post('/api/ai/ask').set(authHeader(other)).send({ question: 'Still fine?' })).status).toBe(200);
  }, 30_000);
});

describe('ai: conversations are private', () => {
  it('hides one learner thread from another and rejects the stranger by id', async () => {
    insertTopicFixture(db, { slug: 'attention' });
    addProvider(db, { name: 'primary' });
    stubFetch(openAiReply('Answered.'));

    const mine = await request(app)
      .post('/api/ai/ask')
      .set(authHeader(learner))
      .send({ question: 'Private question?', context: { kind: 'topic', slug: 'attention' } });
    const id = mine.body.conversation.id;

    const stranger = await registerUser(app, { email: 'ai-stranger@example.com' });
    expect((await request(app).get(`/api/ai/conversations/${id}`).set(authHeader(stranger))).status).toBe(404);
    expect((await request(app).delete(`/api/ai/conversations/${id}`).set(authHeader(stranger))).status).toBe(404);
    expect((await request(app).get('/api/ai/conversations').set(authHeader(stranger))).body.conversations).toHaveLength(0);
    expect((await request(app).post('/api/ai/ask').set(authHeader(stranger)).send({ question: 'Hijack this thread?', conversationId: id })).status).toBe(404);

    expect((await request(app).get('/api/ai/conversations').set(authHeader(learner))).body.total).toBe(1);
    expect((await request(app).delete(`/api/ai/conversations/${id}`).set(authHeader(learner))).status).toBe(200);
    expect(get<{ c: number }>(db, 'SELECT COUNT(*) AS c FROM ai_messages WHERE conversation_id = @id', { id })?.c).toBe(0);
    expect((await request(app).get('/api/ai/conversations').set(authHeader(learner))).body.total).toBe(0);
  });

  it('filters the history by the kind of entry it was opened from', async () => {
    const topicId = insertTopicFixture(db, { slug: 'attention' });
    seedLessonWithTopic(db, { lessonSlug: 'attention-lesson', topicId });
    addProvider(db, { name: 'primary' });
    stubFetch(openAiReply('Answered.'));

    await request(app).post('/api/ai/ask').set(authHeader(learner)).send({ question: 'Topic question?', context: { kind: 'topic', slug: 'attention' } });
    await request(app).post('/api/ai/ask').set(authHeader(learner)).send({ question: 'Lesson question?', context: { kind: 'lesson', slug: 'attention-lesson' } });
    await request(app).post('/api/ai/ask').set(authHeader(learner)).send({ question: 'General question?' });

    const all = await request(app).get('/api/ai/conversations').set(authHeader(learner));
    expect(all.body.total).toBe(3);
    const lessons = await request(app).get('/api/ai/conversations?context=lesson').set(authHeader(learner));
    expect(lessons.body.conversations).toHaveLength(1);
    expect(lessons.body.conversations[0].context.slug).toBe('attention-lesson');
    const general = await request(app).get('/api/ai/conversations?context=general').set(authHeader(learner));
    expect(general.body.conversations[0].context).toBeNull();

    const oneLesson = await request(app)
      .get('/api/ai/conversations?context=lesson&slug=attention-lesson')
      .set(authHeader(learner));
    expect(oneLesson.body.total).toBe(1);
    const otherLesson = await request(app)
      .get('/api/ai/conversations?context=lesson&slug=a-lesson-that-does-not-exist')
      .set(authHeader(learner));
    expect(otherLesson.status).toBe(404);
  });
});
