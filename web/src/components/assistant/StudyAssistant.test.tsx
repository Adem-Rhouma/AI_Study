import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StudyAssistant } from './StudyAssistant';
import type { AssistantMessage, AssistantStatus, AssistantThread } from '../../api/types';
import { SessionProvider } from '../../lib/session';

const USER = {
  id: 7,
  email: 'learner@aimastery.local',
  displayName: 'Rhea Kestrel',
  role: 'learner' as const,
  bio: null,
  avatarUrl: null,
  createdAt: '2026-10-01T09:00:00.000Z',
  lastLoginAt: null
};

const STATUS_OFF: AssistantStatus = {
  configured: false,
  enabledForUser: true,
  provider: null,
  note: 'Set AI_PROVIDER, AI_MODEL and AI_API_KEY to switch this on.',
  rateLimitPerMinute: 20,
  usage: null
};

const STATUS_ON: AssistantStatus = {
  configured: true,
  enabledForUser: true,
  provider: { name: 'primary', adapter: 'openai_compatible', model: 'gpt-test', source: 'database' },
  note: '',
  rateLimitPerMinute: 20,
  usage: { calls: 0, failures: 0, tokensPrompt: 0, tokensCompletion: 0 }
};

const EXISTING: AssistantThread = {
  id: 42,
  title: 'Why is the softmax order-sensitive?',
  context: { kind: 'lesson', slug: 'attention-lesson', title: 'Reading the attention matrix' },
  messageCount: 2,
  createdAt: '2026-11-05T10:00:00.000Z',
  updatedAt: '2026-11-05T10:01:00.000Z'
};

type Thread = AssistantThread;

function message(id: number, role: 'user' | 'assistant', content: string, error: string | null = null): AssistantMessage {
  return { id, role, content, model: role === 'assistant' ? 'gpt-test' : null, error, createdAt: '2026-11-05T10:01:00.000Z' };
}

type Script = {
  status?: AssistantStatus;
  threads?: Thread[];
  detail?: { messages: AssistantMessage[] } | null;
  ask?: { ok: boolean; body?: unknown; status?: number; message?: string };
};

function stubApi(script: Script) {
  const calls: { url: string; method: string; body?: unknown }[] = [];
  const send = (body: unknown, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: { method?: string; body?: string }) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(init.body) : undefined;
      calls.push({ url, method, body });
      const key = `${method} ${url.replace(/^\/api/, '').split('?')[0]}`;

      if (key === 'GET /auth/me') return send({ user: USER, preferences: null });
      if (key === 'GET /ai/status') return send(script.status ?? STATUS_ON);
      if (key === 'GET /ai/conversations')
        return send({ conversations: script.threads ?? [], page: 1, perPage: 1, total: (script.threads ?? []).length, totalPages: 1 });
      if (key === 'GET /ai/conversations/42')
        return send(script.detail ? { conversation: EXISTING, messages: script.detail.messages } : { conversation: EXISTING, messages: [] });
      if (key === 'POST /ai/ask') {
        if (script.ask && !script.ask.ok) {
          return send({ error: { code: 'ai_provider_timeout', message: script.ask.message ?? 'The provider took too long.' } }, script.ask.status ?? 504);
        }
        return send({
          conversation: { ...EXISTING, messageCount: 2 },
          message: message(99, 'assistant', 'Because the weights are computed before the sum.'),
          provider: 'primary',
          latencyMs: 812
        });
      }
      throw new Error(`unstubbed request: ${key}`);
    })
  );
  return calls;
}

function renderPanel(script: Script = {}) {
  const calls = stubApi(script);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { throwOnError: false } } });
  render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <MemoryRouter initialEntries={['/lessons/attention-lesson']}>
          <StudyAssistant context={{ kind: 'lesson', slug: 'attention-lesson' }} entryTitle="Reading the attention matrix" />
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('StudyAssistant', () => {
  it('explains that the install has no provider, without offering a composer', async () => {
    renderPanel({ status: STATUS_OFF });
    expect(await screen.findByText(/Set AI_PROVIDER, AI_MODEL and AI_API_KEY/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask a question' })).not.toBeInTheDocument();
  });

  it('points at the setting when the learner switched it off', async () => {
    renderPanel({ status: { ...STATUS_ON, enabledForUser: false } });
    expect(await screen.findByText(/Switched off for your account/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask a question' })).not.toBeInTheDocument();
  });

  it('sends a starter question with the entry it belongs to and shows the answer', async () => {
    const calls = renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Ask a question' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Quiz me on the key ideas' }));

    expect(await screen.findByText('Because the weights are computed before the sum.')).toBeInTheDocument();

    const ask = calls.find((call) => call.method === 'POST');
    expect(ask?.body).toMatchObject({
      question: 'Quiz me on the key ideas',
      context: { kind: 'lesson', slug: 'attention-lesson' }
    });
    expect(ask?.body).not.toHaveProperty('conversationId');
    // Attribution the learner can act on: which model said this.
    expect(screen.getByText(/primary · gpt-test/)).toBeInTheDocument();
    expect(screen.getByText(/Up to 20 questions a minute/)).toBeInTheDocument();
  });

  it('continues the thread already opened from this lesson', async () => {
    const calls = renderPanel({ threads: [EXISTING], detail: { messages: [message(1, 'user', EXISTING.title), message(2, 'assistant', 'Because the mask is causal.')] } });
    await userEvent.click(await screen.findByRole('button', { name: 'Ask a question' }));

    expect(await screen.findByText('Because the mask is causal.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Your question'), 'And with a bidirectional encoder?');
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));

    await waitFor(() => {
      const ask = calls.find((call) => call.method === 'POST');
      expect(ask?.body).toMatchObject({ question: 'And with a bidirectional encoder?', conversationId: 42 });
    });
  });

  it('keeps a failed question in the thread and says no answer was produced', async () => {
    renderPanel({ ask: { ok: false, status: 504, message: 'The provider took too long to answer. Try again, or shorten the question.' } });
    await userEvent.click(await screen.findByRole('button', { name: 'Ask a question' }));
    await userEvent.type(screen.getByLabelText('Your question'), 'What about grouped query attention?');
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));

    expect(await screen.findByText(/No answer was produced/)).toBeInTheDocument();
    // The question appears twice on purpose: the thread records it (the server stored that turn
    // before calling the provider) and the composer still holds it, so a retry is one click.
    expect(screen.getAllByText('What about grouped query attention?')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Ask' })).toBeEnabled();
  });
});
