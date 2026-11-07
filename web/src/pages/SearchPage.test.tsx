import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SearchPage from './SearchPage';
import { SessionProvider } from '../lib/session';
import { ThemeProvider } from '../lib/theme';
import type { SearchResponse } from '../api/types';

function payload(over: Partial<SearchResponse> = {}): SearchResponse {
  return {
    hits: [],
    groups: [],
    usedFallback: false,
    tookMs: 2,
    query: { q: 'attention', scope: 'all', page: 1, limit: 30 },
    ...over
  };
}

/** Routes only the two endpoints this page touches; anything else fails the test loudly. */
function stubFetch(search: SearchResponse) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: unknown) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith('/api/auth/me')) {
      return jsonResponse({ user: null, preferences: null });
    }
    if (url.startsWith('/api/search')) {
      return jsonResponse(search);
    }
    throw new Error(`unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

function jsonResponse(body: unknown) {  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body)
  } as unknown as Response;
}

function renderPage(entry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <SessionProvider>
          <MemoryRouter initialEntries={[entry]}>
            <SearchPage />
          </MemoryRouter>
        </SessionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SearchPage', () => {
  it('groups hits, links them to their pages and marks the matched words', async () => {
    stubFetch(
      payload({
        hits: [
          {
            type: 'topics',
            slug: 'attention-mechanics',
            title: 'Attention mechanics',
            snippet: 'Scaled dot-product attention … the attention matrix.',
            context: 'Transformers / Attention',
            difficulty: 'intermediate',
            score: 1
          },
          {
            type: 'lessons',
            slug: 'attention-lesson',
            title: 'Reading the attention matrix',
            snippet: 'Step through attention by hand.',
            context: 'Flagship course',
            difficulty: null,
            score: 2
          }
        ]
      })
    );
    const { container } = renderPage('/search?q=attention');

    expect(await screen.findByRole('heading', { name: 'Topics' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lessons' })).toBeInTheDocument();
    expect(screen.getByText('2 matches for “attention”')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Attention mechanics — open topic' })).toHaveAttribute(
      'href',
      '/explore/attention-mechanics'
    );
    expect(screen.getByRole('link', { name: 'Reading the attention matrix — open lesson' })).toHaveAttribute(
      'href',
      '/lessons/attention-lesson'
    );

    // Highlighting must not disturb the announced name, and must mark both spellings of the term.
    expect([...container.querySelectorAll('mark')].map((node) => node.textContent)).toEqual(
      expect.arrayContaining(['Attention', 'attention'])
    );
  });

  it('says plainly when results came from the plain text fallback', async () => {
    stubFetch(
      payload({
        usedFallback: true,
        hits: [
          { type: 'courses', slug: 'c', title: 'Foundations', snippet: '', context: null, difficulty: null, score: 1 }
        ]
      })
    );
    renderPage('/search?q=attention');
    expect(await screen.findByText(/Plain text match/i)).toBeInTheDocument();
  });

  it('frames an empty query as suggestions rather than results', async () => {
    stubFetch(
      payload({
        query: { q: '', scope: 'all', page: 1, limit: 30 },
        hits: [{ type: 'paths', slug: 'p', title: 'Start here', snippet: '', context: null, difficulty: null, score: 0 }]
      })
    );
    renderPage('/search');
    expect(await screen.findByText('1 starting point')).toBeInTheDocument();
    expect(screen.getByText(/Nothing searched yet/i)).toBeInTheDocument();
  });

  it('reports nothing found in the section that was searched', async () => {
    stubFetch(payload({ hits: [] }));
    renderPage('/search?q=attention&scope=exercises');
    expect(await screen.findByRole('heading', { name: /No Problems match “attention”/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Search across everything/i })).toBeInTheDocument();
  });

  it('keeps the query in the address bar so a search is shareable', async () => {
    const calls = stubFetch(payload({ hits: [] }));
    renderPage('/search');
    await screen.findByRole('button', { name: /^Search$/ });

    await userEvent.type(screen.getByRole('searchbox', { name: /Search the platform/i }), 'rope');
    await userEvent.click(screen.getByRole('button', { name: /^Search$/ }));

    await waitFor(() => {
      expect(calls.some((url) => new URL(url, 'http://localhost').searchParams.get('q') === 'rope')).toBe(true);
    });
  });
});
