import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminPage from './AdminPage';
import { SessionProvider } from '../lib/session';
import { ThemeProvider } from '../lib/theme';
import { ToastProvider } from '../components/ui/Toast';
import type { AdminFieldSpec, AdminKindsResponse, AdminKindSpec, User } from '../api/types';

type Call = { url: string; method: string; body?: unknown };

/** A response the stub should answer with an error envelope instead of JSON data. */
function fails(status: number, body: unknown) {
  return { __status: status, __body: body };
}

const USER = (role: User['role']): User => ({
  id: 3,
  email: 'rhea@aimastery.local',
  displayName: 'Rhea Kestrel',
  role,
  bio: null,
  avatarUrl: null,
  createdAt: '2026-10-01T09:00:00.000Z',
  lastLoginAt: '2026-11-06T08:00:00.000Z'
});

/** The same shape the server publishes: presentation only, never a column or a table name. */
function spec(key: string, label: string, extra: Partial<AdminFieldSpec> = {}): AdminFieldSpec {
  return {
    key,
    label,
    type: 'text',
    required: false,
    max: null,
    min: null,
    options: null,
    hint: null,
    target: null,
    default: null,
    integer: false,
    ...extra
  };
}

const LESSON: AdminKindSpec = {
  kind: 'lesson',
  label: 'Lessons',
  hasSlug: true,
  statuses: ['draft', 'review', 'published', 'archived'],
  consequence: 'Every edit writes a revision snapshot first, so a lesson can be read back as it was.',
  fields: [
    spec('title', 'Title', { required: true, max: 200 }),
    spec('slug', 'Slug', { type: 'slug', required: true }),
    spec('course', 'Course', { type: 'ref', target: 'courses', required: true }),
    spec('module', 'Module title', { type: 'ref', target: 'course_modules', hint: 'Matched against the modules of the selected course.' }),
    spec('estMinutes', 'Estimated minutes', { type: 'number', integer: true, min: 1, max: 600, default: 15 }),
    spec('status', 'Status', { type: 'select', required: true, options: ['draft', 'review', 'published', 'archived'], default: 'draft' })
  ],
  relations: [
    { key: 'blocks', label: 'Content blocks', shape: 'block' },
    { key: 'topics', label: 'Topics taught', shape: 'topic-link' }
  ],
  listCounts: [{ key: 'blocks', label: 'blocks' }]
};

const TOPIC: AdminKindSpec = {
  kind: 'topic',
  label: 'Topics',
  hasSlug: true,
  statuses: ['draft', 'published'],
  consequence: 'Topics are the map learners browse; a published topic with no lessons reads as a dead end.',
  fields: [spec('name', 'Name', { required: true }), spec('slug', 'Slug', { type: 'slug', required: true })],
  relations: [],
  listCounts: []
};

const KINDS: AdminKindsResponse = {
  kinds: [LESSON, TOPIC],
  itemShapes: {
    block: [
      spec('type', 'Block type', { type: 'select', required: true, options: ['text', 'callout'], default: 'text' }),
      spec('text', 'Text', { type: 'textarea', max: 20000, default: '' }),
      spec('payload', 'Extra data (JSON)', { type: 'json', default: {} })
    ],
    'topic-link': [spec('slug', 'Topic', { type: 'ref', target: 'topics', required: true })]
  },
  providerAdapters: ['openai_compatible', 'anthropic', 'ollama']
};

const LESSON_DOC = {
  title: 'Attention, step by step',
  slug: 'attention-basics',
  course: 'transformers-from-scratch',
  module: 'Foundations',
  estMinutes: 12,
  status: 'draft',
  blocks: [{ type: 'callout', text: 'Read the shapes first.', payload: { tone: 'info' } }],
  topics: [{ slug: 'attention' }]
};

const OVERVIEW = {
  content: [
    { kind: 'lesson', label: 'Lessons', total: 41, published: 38, unpublished: 3, statuses: [] },
    { kind: 'topic', label: 'Topics', total: 112, published: 104, unpublished: 8, statuses: [] },
    {
      kind: 'event',
      label: 'Events and competitions',
      total: 11,
      published: null,
      unpublished: null,
      statuses: [
        { status: 'recurring', count: 9 },
        { status: 'open', count: 2 }
      ]
    }
  ],
  people: { learners: 640, staff: 4, active: 512 },
  assistant: { configured: true, providers: 2, enabled: 1 },
  recent: [],
  health: [
    { key: 'empty_lessons', label: 'Published lessons with no content blocks', kind: 'lesson', count: 2, note: 'A lesson page with nothing in it reads as broken.' },
    { key: 'thin_topics', label: 'Published topics with an empty definition', kind: 'topic', count: 0, note: 'A definition of one sentence is not a topic.' }
  ]
};

/**
 * One stub for every endpoint the studio can reach; an unstubbed call throws so a test cannot pass
 * by quietly not asking for what it claims to have asked for.
 */
function stubApi(overrides: Record<string, unknown> = {}, user: User = USER('admin')): Call[] {
  const calls: Call[] = [];
  const responses: Record<string, unknown> = {
    'GET /admin/kinds': KINDS,
    'GET /admin/content/lesson': {
      items: [{ id: 12, slug: 'attention-basics', title: 'Attention, step by step', status: 'draft', updatedAt: '2026-11-01T10:00:00.000Z', counts: { blocks: 1 } }],
      page: 1,
      perPage: 24,
      total: 1,
      totalPages: 1
    },
    'GET /admin/content/lesson/attention-basics': {
      meta: { id: 12, slug: 'attention-basics', title: 'Attention, step by step', status: 'draft', createdAt: '2026-10-02T09:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z' },
      doc: LESSON_DOC
    },
    'PUT /admin/content/lesson/attention-basics': { id: 12, ref: 'attention-basics' },
    'POST /admin/content/lesson': { id: 13, ref: 'new-lesson' },
    'POST /admin/content/lesson/attention-basics/status': { kind: 'lesson', ref: 'attention-basics', status: 'published' },
    'GET /admin/content/lesson/attention-basics/revisions': { revisions: [] },
    'GET /admin/refs/courses': { options: [{ value: 'transformers-from-scratch', label: 'Transformers from scratch' }] },
    'GET /admin/refs/course_modules': { options: [{ value: 'Foundations', label: 'Foundations' }] },
    'GET /admin/refs/topics': { options: [{ value: 'attention', label: 'Attention' }] },
    'GET /admin/overview': OVERVIEW,
    'GET /admin/changes': { changes: [{ id: 4, at: '2026-11-05T18:00:00.000Z', actor: 'Rhea Kestrel', kind: 'lesson', ref: 'attention-basics', action: 'update', summary: 'Saved 1 block.' }] },
    'GET /admin/providers': {
      providers: [
        {
          id: 1,
          name: 'primary',
          adapter: 'openai_compatible',
          baseUrl: 'https://api.example.com/v1',
          model: 'gpt-4o-mini',
          keyStored: true,
          keyHint: 'wxyz',
          isEnabled: true,
          priority: 0,
          temperature: 0.3,
          maxTokens: 900,
          timeoutMs: 30000
        }
      ]
    },
    'GET /admin/users': { total: 2, items: [{ id: 3, email: 'rhea@aimastery.local', displayName: 'Rhea Kestrel', role: 'admin', isActive: true, sessions: 2, createdAt: '2026-10-01T09:00:00.000Z', lastLoginAt: '2026-11-06T08:00:00.000Z' }] },
    ...overrides
  };

  const send = (body: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: { method?: string; body?: string }) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(init.body) : undefined;
      calls.push({ url, method, body });

      const key = `${method} ${url.replace(/^\/api/, '').split('?')[0]}`;
      if (key === 'GET /auth/me') return send({ user, preferences: null });
      if (key in responses) {
        const value = responses[key] as { __status?: number; __body?: unknown };
        if (value && typeof value === 'object' && '__status' in value) {
          return { ok: false, status: value.__status as number, text: async () => JSON.stringify(value.__body) };
        }
        return send(value);
      }
      throw new Error(`unstubbed request: ${key}`);
    })
  );
  return calls;
}

function renderPage(entry: string) {
  const client = new QueryClient({ defaultOptions: { mutations: { throwOnError: false } } });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <SessionProvider>
            <MemoryRouter initialEntries={[entry]}>
              <AdminPage />
            </MemoryRouter>
          </SessionProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AdminPage', () => {
  it('lists the content types the server describes, not the ones named here', async () => {
    stubApi();
    renderPage('/admin?tab=content&kind=lesson');

    expect(await screen.findByRole('tab', { name: 'Lessons' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByRole('tab', { name: 'Topics' })).toBeInTheDocument();
    // Required labels carry a marker and hints sit inside the same element, so label queries prefix-match.
    const row = await screen.findByRole('button', { name: 'Attention, step by step' });
    expect(row).toBeInTheDocument();
    expect(screen.getByText('blocks')).toBeInTheDocument();
  });

  it('opens the document the address bar names and sends JSON children as values', async () => {
    const calls = stubApi();
    renderPage('/admin?tab=content&kind=lesson&ref=attention-basics');

    const title = await screen.findByLabelText(/^Title/);
    await waitFor(() => expect(title).toHaveValue('Attention, step by step'));

    await userEvent.clear(title);
    await userEvent.type(title, 'Attention, token by token');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      const put = calls.find((call) => call.method === 'PUT');
      expect(put?.url).toBe('/api/admin/content/lesson/attention-basics');
      expect(put?.body).toMatchObject({
        title: 'Attention, token by token',
        course: 'transformers-from-scratch',
        blocks: [{ type: 'callout', text: 'Read the shapes first.', payload: { tone: 'info' } }]
      });
    });
    // The revision history belongs to the lesson being edited, not to the type in general.
    expect(calls.some((call) => call.url.includes('/revisions'))).toBe(true);
  });

  it('seeds a new document from the defaults the descriptor carries', async () => {
    const calls = stubApi();
    renderPage('/admin?tab=content&kind=lesson&ref=new');

    const title = await screen.findByLabelText(/^Title/);
    expect(title).toHaveValue('');
    expect(screen.getByLabelText(/^Estimated minutes/)).toHaveValue(15);

    await userEvent.type(title, 'Scaling laws');
    const slug = screen.getByLabelText(/^Slug/);
    await userEvent.clear(slug);
    await userEvent.type(slug, 'scaling-laws');
    await userEvent.click(screen.getByRole('button', { name: 'Create lesson' }));

    await waitFor(() => {
      const post = calls.find((call) => call.method === 'POST' && call.url === '/api/admin/content/lesson');
      expect(post?.body).toMatchObject({ title: 'Scaling laws', slug: 'scaling-laws', estMinutes: 15, status: 'draft', blocks: [] });
    });
  });

  it('publishes from the list without opening the editor', async () => {
    const calls = stubApi();
    renderPage('/admin?tab=content&kind=lesson');

    const status = await screen.findByLabelText('Status for Attention, step by step');
    await userEvent.selectOptions(status, 'published');

    await waitFor(() => {
      const change = calls.find((call) => call.url.endsWith('/status'));
      expect(change?.url).toBe('/api/admin/content/lesson/attention-basics/status');
      expect(change?.body).toEqual({ status: 'published' });
    });
  });

  it('refuses to send a block whose JSON does not parse, and names it', async () => {
    const calls = stubApi();
    renderPage('/admin?tab=content&kind=lesson&ref=attention-basics');

    const json = await screen.findByLabelText('Extra data (JSON)');
    await userEvent.clear(json);
    await userEvent.type(json, 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Fix this JSON first')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(0);
  });

  it('keeps the editor open and points at the field the server rejected', async () => {
    stubApi({
      'PUT /admin/content/lesson/attention-basics': fails(422, {
        error: { code: 'unprocessable', message: 'The lesson document did not pass the content rules.', details: [{ field: 'title', message: 'A title between 2 and 200 characters.' }] }
      })
    });
    renderPage('/admin?tab=content&kind=lesson&ref=attention-basics');

    const title = await screen.findByLabelText(/^Title/);
    await userEvent.clear(title);
    await userEvent.type(title, 'A');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('A title between 2 and 200 characters.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Title/)).toHaveValue('A');
  });

  it('says what needs attention on the overview and links it to the kind', async () => {
    const calls = stubApi();
    renderPage('/admin');

    expect(await screen.findByText('Lessons')).toBeInTheDocument();
    expect(screen.getByText(/Published lessons with no content blocks/)).toBeInTheDocument();
    expect(screen.queryByText(/Published topics with an empty definition/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open lesson' })).toBeInTheDocument();
    // Events never have a publish state: counting them as "0 published" would invent a gap.
    expect(screen.getByText('of 153 rows that have a publish state')).toBeInTheDocument();
    expect(screen.getByText('9 recurring · 2 open')).toBeInTheDocument();
    expect(screen.queryByText('11 published · 0 not published')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Open lesson' }));
    await waitFor(() => expect(calls.some((call) => call.url.startsWith('/api/admin/content/lesson?'))).toBe(true));
    expect(screen.getByRole('tab', { name: 'Lessons' })).toHaveAttribute('data-state', 'active');
  });

  it('shows the stored key hint and never a key, and hands the choice of wire format to the server', async () => {
    stubApi();
    renderPage('/admin?tab=assistant');

    expect(await screen.findByText(/ends wxyz/)).toBeInTheDocument();
    expect(screen.queryByText(/sk-/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add provider' }));
    const key = await screen.findByLabelText(/^API key/);
    expect(key).toHaveValue('');
    const adapter = screen.getByLabelText(/^Wire format/);
    expect(adapter).toBeInTheDocument();
    await userEvent.selectOptions(adapter, 'ollama');
    expect(screen.getByRole('option', { name: 'anthropic' })).toBeInTheDocument();
  });

  it('keeps the accounts section away from an author', async () => {
    stubApi({}, USER('author'));
    renderPage('/admin?tab=assistant');

    expect(await screen.findByRole('tab', { name: 'Assistant' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Accounts' })).not.toBeInTheDocument();
    // An author reads the provider list but cannot change it.
    expect(screen.queryByRole('button', { name: 'Add provider' })).not.toBeInTheDocument();
    expect(await screen.findByText(/only administrators change it/)).toBeInTheDocument();
  });

  it('lists accounts for an administrator and refuses to change their own', async () => {
    stubApi();
    renderPage('/admin?tab=accounts');

    expect(await screen.findByText('rhea@aimastery.local')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Role for Rhea Kestrel'), 'learner');

    expect(await screen.findByText(/will not let you remove your own access/)).toBeInTheDocument();
  });
});
