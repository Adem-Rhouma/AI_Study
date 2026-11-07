/** Query-key factories. Centralised so a mutation in one page invalidates the right cache in another. */

export const keys = {
  session: ['session'] as const,
  preferences: ['preferences'] as const,

  dashboard: ['dashboard'] as const,

  domains: ['curriculum', 'domains'] as const,
  domain: (slug: string) => ['curriculum', 'domains', slug] as const,
  topics: (filters?: Record<string, unknown>) => ['curriculum', 'topics', filters ?? {}] as const,
  topic: (slug: string) => ['curriculum', 'topics', slug] as const,
  topicNeighborhood: (slug: string, depth: number) =>
    ['curriculum', 'topics', slug, 'neighborhood', depth] as const,
  graph: (scope: Record<string, unknown>) => ['curriculum', 'graph', scope] as const,
  stats: ['curriculum', 'stats'] as const,

  courses: (filters?: Record<string, unknown>) => ['courses', filters ?? {}] as const,
  course: (slug: string) => ['courses', slug] as const,
  lesson: (slug: string) => ['lessons', slug] as const,
  lessonState: (slug: string) => ['lessons', slug, 'state'] as const,

  paths: (filters?: Record<string, unknown>) => ['paths', filters ?? {}] as const,
  path: (slug: string) => ['paths', slug] as const,
  myPaths: ['paths', 'mine'] as const,

  exercises: (filters?: Record<string, unknown>) => ['exercises', filters ?? {}] as const,
  exercise: (slug: string) => ['exercises', slug] as const,
  attempts: (slug: string) => ['exercises', slug, 'attempts'] as const,
  arenaStats: ['arena', 'stats'] as const,
  arenaRecommend: (limit: number) => ['arena', 'recommend', limit] as const,
  myAttempts: (filters?: Record<string, unknown>) => ['arena', 'attempts', filters ?? {}] as const,

  resources: (filters?: Record<string, unknown>) => ['resources', filters ?? {}] as const,
  /** Prefix key: bookmarking from anywhere has to refresh every resource projection at once. */
  resourcesAll: ['resources'] as const,
  resource: (slug: string) => ['resources', slug] as const,
  resourceFacets: ['resources', 'facets'] as const,
  curatedCollections: ['resources', 'collections'] as const,
  curatedCollection: (slug: string) => ['resources', 'collections', slug] as const,
  myCollections: ['resources', 'mine'] as const,
  myCollection: (id: number) => ['resources', 'mine', id] as const,

  researchAreas: ['research', 'areas'] as const,
  researchPapers: (filters?: Record<string, unknown>) => ['research', 'papers', filters ?? {}] as const,
  milestones: (filters?: Record<string, unknown>) => ['research', 'milestones', filters ?? {}] as const,
  mustReads: ['research', 'must-reads'] as const,
  competitions: (filters?: Record<string, unknown>) => ['competitions', filters ?? {}] as const,
  eventCalendar: (days: number) => ['events', 'calendar', days] as const,
  event: (slug: string) => ['events', slug] as const,

  search: (q: string, scope: string, limit: number) => ['search', q, scope, limit] as const,

  /** Prefix key: any graded action refreshes every progress projection at once. */
  progressAll: ['progress'] as const,
  mastery: ['progress', 'mastery'] as const,
  masteryList: (filters?: Record<string, unknown>) => ['progress', 'mastery', 'list', filters ?? {}] as const,
  topicMastery: (slug: string) => ['progress', 'mastery', slug] as const,
  progressOverview: ['progress', 'overview'] as const,
  reviewQueue: ['progress', 'review'] as const,
  progressPaths: ['progress', 'paths'] as const,
  activity: (days: number) => ['progress', 'activity', days] as const,

  notes: (target?: Record<string, unknown>) => ['notes', target ?? {}] as const,
  bookmarks: ['bookmarks'] as const,

  aiStatus: ['ai', 'status'] as const,
  aiUsage: ['ai', 'usage'] as const,
  aiThreads: (context: Record<string, unknown>) => ['ai', 'threads', context] as const,
  aiThread: (id: number) => ['ai', 'thread', id] as const,

  /* Content Studio. `contentAll` is the prefix a save invalidates: a lesson edit changes its own
     document, the kind list, the overview counts and the audit trail at once. */
  adminKinds: ['admin', 'kinds'] as const,
  adminOverview: ['admin', 'overview'] as const,
  adminChanges: ['admin', 'changes'] as const,
  adminContent: (kind: string, filters?: Record<string, unknown>) => ['admin', 'content', kind, filters ?? {}] as const,
  adminDocument: (kind: string, ref: string) => ['admin', 'content', kind, 'one', ref] as const,
  contentAll: ['admin', 'content'] as const,
  adminRefs: (target: string, course: string | null, q: string) => ['admin', 'refs', target, course, q] as const,
  adminRevisions: (ref: string) => ['admin', 'revisions', ref] as const,
  /** Prefix key: saving a lesson retires every cached revision list. */
  adminRevisionsAll: ['admin', 'revisions'] as const,
  adminRevision: (ref: string, id: number) => ['admin', 'revisions', ref, id] as const,
  adminProviders: ['admin', 'providers'] as const,
  adminAccounts: (filters?: Record<string, unknown>) => ['admin', 'accounts', filters ?? {}] as const
};
