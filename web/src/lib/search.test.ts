import { describe, expect, it } from 'vitest';
import { groupSearchHits, highlightChunks, hitRoute, SEARCH_HIT_LABEL, SEARCH_SCOPE_LABEL, searchTokens } from './search';
import { SEARCH_SCOPES, type SearchHit } from '../api/types';

const hit = (over: Partial<SearchHit> & Pick<SearchHit, 'type' | 'slug'>): SearchHit => ({
  title: 'Title',
  snippet: '',
  context: null,
  difficulty: null,
  score: 0,
  ...over
});

describe('search presentation helpers', () => {
  it('groups hits in the server’s section order and drops empty ones', () => {
    const groups = groupSearchHits([
      hit({ type: 'paths', slug: 'p1' }),
      hit({ type: 'topics', slug: 't1' }),
      hit({ type: 'topics', slug: 't2' }),
      hit({ type: 'exercises', slug: 'e1' })
    ]);
    expect(groups.map((group) => group.type)).toEqual(['topics', 'exercises', 'paths']);
    expect(groups[0]).toMatchObject({ label: SEARCH_SCOPE_LABEL.topics, count: 2 });
  });

  it('maps every searchable entity to a route the app actually serves', () => {
    expect(hitRoute(hit({ type: 'topics', slug: 'attention' }))).toBe('/explore/attention');
    expect(hitRoute(hit({ type: 'lessons', slug: 'a' }))).toBe('/lessons/a');
    expect(hitRoute(hit({ type: 'resources', slug: 'a' }))).toBe('/resources/a');
    expect(hitRoute(hit({ type: 'exercises', slug: 'a' }))).toBe('/arena/a');
    expect(hitRoute(hit({ type: 'paths', slug: 'a' }))).toBe('/paths/a');
    expect(hitRoute(hit({ type: 'courses', slug: 'a' }))).toBe('/courses/a');
    expect(hitRoute(hit({ type: 'collections', slug: 'a' }))).toBe('/resources/collections/a');

    // A new scope on the server without a route here would leave dead links in search results.
    const entityTypes = (Object.keys(SEARCH_SCOPE_LABEL) as (keyof typeof SEARCH_SCOPE_LABEL)[]).filter(
      (value) => value !== 'all'
    );
    expect(entityTypes).toHaveLength((SEARCH_SCOPES as string[]).length - 1);
    expect(Object.keys(SEARCH_HIT_LABEL).sort()).toEqual([...entityTypes].sort());
  });

  it('tokenises like the server does: words only, deduped, eight at most', () => {
    expect(searchTokens('Attention, ATTENTION and "mechanics"!')).toEqual(['attention', 'and', 'mechanics']);
    expect(searchTokens('   ')).toEqual([]);
    expect(searchTokens(Array.from({ length: 12 }, (_, i) => `w${i}`).join(' '))).toHaveLength(8);
  });

  it('marks matches without ever emitting markup of its own', () => {
    expect(highlightChunks('Gradient descent step size', ['step', 'gradient'])).toEqual([
      ['Gradient', true],
      [' descent ', false],
      ['step', true],
      [' size', false]
    ]);
    // The injection attempt survives as literal text: chunks are rendered as children, not HTML.
    expect(highlightChunks('<img src=x onerror=alert(1)>', ['<img', 'onerror'])).toEqual([
      ['<img', true],
      [' src=x ', false],
      ['onerror', true],
      ['=alert(1)>', false]
    ]);
  });

  it('leaves short and unmatched text alone', () => {
    expect(highlightChunks('anything', ['a'])).toEqual([['anything', false]]);
    expect(highlightChunks('', ['attention'])).toEqual([['', false]]);
    expect(highlightChunks('no overlap here', ['attention'])).toEqual([['no overlap here', false]]);
  });
});
