import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SettingsPage from './SettingsPage';
import { SessionProvider } from '../lib/session';
import { ThemeProvider } from '../lib/theme';
import { ToastProvider } from '../components/ui/Toast';

type Call = { url: string; method: string; body?: unknown };

const USER = {
  id: 7,
  email: 'learner@aimastery.local',
  displayName: 'Rhea Kestrel',
  role: 'learner' as const,
  bio: null,
  avatarUrl: null,
  createdAt: '2026-10-01T09:00:00.000Z',
  lastLoginAt: '2026-11-06T08:00:00.000Z'
};

const PREFS = {
  theme: 'system',
  reducedMotion: false,
  uiDensity: 'comfortable',
  dailyGoalMinutes: 20,
  defaultDifficulty: 'intermediate',
  showSolutionsByDefault: true,
  aiAssistantEnabled: false
};

/**
 * One stub for every endpoint the settings screens can reach. Unknown calls throw, so a test can
 * never pass by silently not sending what it claims to send.
 */
function stubApi(responses: Record<string, unknown> = {}): Call[] {
  const calls: Call[] = [];
  const send = (body: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: { method?: string; body?: string }) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(init.body) : undefined;
      calls.push({ url, method, body });

      const key = `${method} ${url.replace(/^\/api/, '').split('?')[0]}`;
      if (key in responses) return send(responses[key]);
      if (key === 'GET /auth/me') return send({ user: USER, preferences: PREFS });
      if (key === 'PATCH /auth/me') return send({ user: USER, preferences: PREFS });
      if (key === 'PUT /auth/me/preferences') return send({ preferences: { ...PREFS, ...(body as object) } });
      if (key === 'POST /auth/me/password') return send({ ok: true, note: 'Other devices were signed out.' });
      if (key === 'GET /notes') return send({ notes: [], page: 1, perPage: 10, total: 0, totalPages: 1 });
      if (key === 'GET /notes/bookmarks') return send({ bookmarks: [] });
      if (key === 'GET /ai/status')
        return send({
          configured: false,
          enabledForUser: true,
          provider: null,
          note: 'The study assistant is off until a provider is configured.',
          rateLimitPerMinute: 20,
          usage: null
        });
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
              <SettingsPage />
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

describe('SettingsPage', () => {
  it('opens the section named in the address bar', async () => {
    stubApi();
    renderPage('/settings?tab=security');
    // Labels carry a hint and a required marker, so every label query below is a prefix match.
    expect(await screen.findByLabelText(/^Current password/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Security' })).toHaveAttribute('data-state', 'active');
  });

  it('saves the display name and bio the server can accept', async () => {
    const calls = stubApi();
    renderPage('/settings');

    await userEvent.clear(await screen.findByLabelText(/^Display name/));
    await userEvent.type(screen.getByLabelText(/^Display name/), 'Rhea K.');
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => {
      const patch = calls.find((call) => call.method === 'PATCH');
      expect(patch?.body).toEqual({ displayName: 'Rhea K.', bio: null });
    });
  });

  it('refuses a display name the server would reject, without calling it', async () => {
    const calls = stubApi();
    renderPage('/settings');

    await userEvent.clear(await screen.findByLabelText(/^Display name/));
    await userEvent.type(screen.getByLabelText(/^Display name/), 'A');
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(await screen.findByText(/between 2 and 60 characters/)).toBeInTheDocument();
    expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(0);
  });

  it('sends the whole preference row, keeping keys this form does not expose', async () => {
    const calls = stubApi();
    renderPage('/settings?tab=preferences');

    await userEvent.click(await screen.findByRole('button', { name: 'Dark' }));
    await userEvent.clear(screen.getByLabelText(/Daily study goal/));
    await userEvent.type(screen.getByLabelText(/Daily study goal/), '45');
    await userEvent.click(screen.getByRole('button', { name: 'Save preferences' }));

    await waitFor(() => {
      const put = calls.find((call) => call.method === 'PUT');
      expect(put?.body).toEqual({
        ...PREFS,
        theme: 'dark',
        dailyGoalMinutes: 45
      });
    });
    // The one setting no screen reads yet is not offered as if it worked.
    expect(screen.queryByLabelText(/Show solutions/)).not.toBeInTheDocument();
  });

  it('offers the assistant switch, says when nothing is configured, and saves it', async () => {
    const calls = stubApi();
    renderPage('/settings?tab=preferences');

    const toggle = await screen.findByRole('switch', { name: 'Ask the study assistant' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/No provider is configured on this install/)).toBeInTheDocument();

    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole('button', { name: 'Save preferences' }));

    await waitFor(() => {
      const put = calls.find((call) => call.method === 'PUT');
      expect(put?.body).toMatchObject({ aiAssistantEnabled: true });
    });
  });

  it('names the configured provider instead of implying the assistant is local', async () => {
    stubApi({
      'GET /ai/status': {
        configured: true,
        enabledForUser: true,
        provider: { name: 'primary', adapter: 'openai_compatible', model: 'gpt-4o-mini', source: 'database' },
        note: '',
        rateLimitPerMinute: 20,
        usage: { calls: 4, failures: 0, tokensPrompt: 900, tokensCompletion: 300 }
      }
    });
    renderPage('/settings?tab=preferences');

    expect(await screen.findByRole('switch', { name: 'Ask the study assistant' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/gpt-4o-mini/)).toBeInTheDocument();
    expect(screen.getByText(/it never receives exercise/)).toBeInTheDocument();
    expect(screen.queryByText(/No provider is configured/)).not.toBeInTheDocument();
  });

  it('blocks a new password that does not meet the rules and never submits it', async () => {
    const calls = stubApi();
    renderPage('/settings?tab=security');

    await userEvent.type(await screen.findByLabelText(/^Current password/), 'Learn-2026-demo');
    await userEvent.type(screen.getByLabelText(/^New password/), 'short1');
    await userEvent.type(screen.getByLabelText(/^Repeat new password/), 'short1');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText(/has to meet every rule/)).toBeInTheDocument();
    expect(calls.filter((call) => call.url.includes('/password'))).toHaveLength(0);
  });

  it('gates the account deletion behind the literal confirmation word', async () => {
    const calls = stubApi({ 'DELETE /auth/me': { ok: true, note: 'deleted' } });
    renderPage('/settings?tab=data');

    await userEvent.click(await screen.findByRole('button', { name: 'Delete my account' }));
    const confirm = await screen.findByRole('button', { name: 'Delete permanently' });
    expect(confirm).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/^Your password/), 'Learn-2026-demo');
    await userEvent.type(screen.getByLabelText(/^Type DELETE/), 'delete');
    expect(screen.getByRole('button', { name: 'Delete permanently' })).toBeDisabled();

    await userEvent.clear(screen.getByLabelText(/^Type DELETE/));
    await userEvent.type(screen.getByLabelText(/^Type DELETE/), 'DELETE');
    await userEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

    await waitFor(() => {
      const deletion = calls.find((call) => call.method === 'DELETE');
      expect(deletion?.body).toEqual({ password: 'Learn-2026-demo', confirm: 'DELETE' });
    });
  });
});
