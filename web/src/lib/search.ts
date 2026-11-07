/**
 * Search presentation helpers. The server groups the hits it returns for one page
 * (`groups` in the payload); when a page has accumulated more than one page of results the same
 * grouping is redone here, so the label list and the order below must stay aligned with
 * `groupHits` in server/src/modules/search/search.repo.ts.
 */

import type { SearchEntityType, SearchGroup, SearchHit, SearchScope } from '../api/types';

export const SEARCH_SCOPE_LABEL: Record<SearchScope, string> = {
  all: 'Everything',
  topics: 'Topics',
  lessons: 'Lessons',
  resources: 'Resources',
  exercises: 'Problems',
  paths: 'Learning paths',
  courses: 'Courses',
  collections: 'Collections'
};

/**
 * One hit links to one page, so the singular form is what a card and its accessible name should say.
 * The group headings above stay plural.
 */
export const SEARCH_HIT_LABEL: Record<SearchEntityType, string> = {
  topics: 'topic',
  lessons: 'lesson',
  resources: 'resource',
  exercises: 'problem',
  paths: 'learning path',
  courses: 'course',
  collections: 'collection'
};

const GROUP_ORDER: SearchEntityType[] = [
  'topics',
  'lessons',
  'resources',
  'exercises',
  'paths',
  'courses',
  'collections'
];
/** Where a hit's detail page lives. One table so a nav change cannot leave search links dead. */
const HIT_ROUTE: Record<SearchEntityType, (slug: string) => string> = {
  topics: (slug) => `/explore/${slug}`,
  lessons: (slug) => `/lessons/${slug}`,
  resources: (slug) => `/resources/${slug}`,
  exercises: (slug) => `/arena/${slug}`,
  paths: (slug) => `/paths/${slug}`,
  courses: (slug) => `/courses/${slug}`,
  collections: (slug) => `/resources/collections/${slug}`
};

export function hitRoute(hit: Pick<SearchHit, 'type' | 'slug'>): string {
  return HIT_ROUTE[hit.type](hit.slug);
}

export function groupSearchHits(hits: SearchHit[]): SearchGroup[] {
  const byType = new Map<SearchEntityType, SearchHit[]>();
  for (const hit of hits) {
    const list = byType.get(hit.type) ?? [];
    list.push(hit);
    byType.set(hit.type, list);
  }
  return GROUP_ORDER.filter((type) => byType.has(type)).map((type) => {
    const items = byType.get(type) ?? [];
    return { type, label: SEARCH_SCOPE_LABEL[type], count: items.length, items };
  });
}

/** The query text is tokenised server-side; highlighting uses the same raw words the learner typed. */
export function searchTokens(query: string): string[] {
  return [...new Set(query.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_]*/gu) ?? [])].slice(0, 8);
}

/**
 * Split `text` around every token so matches can be marked without injecting HTML.
 * Returns [chunk, isMatch][]; a one-element array with isMatch false means "nothing to mark".
 */
export function highlightChunks(text: string, tokens: string[]): [string, boolean][] {
  if (text === '' || tokens.length === 0) return [[text, false]];
  const escaped = tokens
    .filter((token) => token.length >= 2)
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length);
  if (escaped.length === 0) return [[text, false]];

  const pattern = new RegExp(`(${escaped.join('|')})`, 'giu');
  const chunks: [string, boolean][] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) chunks.push([text.slice(cursor, start), false]);
    chunks.push([match[0], true]);
    cursor = start + match[0].length;
  }
  if (cursor < text.length) chunks.push([text.slice(cursor), false]);
  return chunks.length > 0 ? chunks : [[text, false]];
}
