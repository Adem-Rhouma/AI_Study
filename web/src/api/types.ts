/**
 * Shapes returned by the API. The server serialises camelCase; every type here was written against
 * the route handler that produces it. Add a section only after reading that handler.
 */

export type Difficulty = 'introductory' | 'beginner' | 'intermediate' | 'advanced' | 'expert';
export type MasteryLevel = 'new' | 'exposed' | 'learning' | 'practising' | 'proficient' | 'mastered';
export type RelationKind = 'strict' | 'recommended' | 'related' | 'extension';
export type UserRole = 'learner' | 'author' | 'admin';
export type PublishStatus = 'draft' | 'review' | 'published' | 'archived';

export type PageMeta = {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
};

/* ------------------------------------------------------------------ auth */

export type User = {
  id: number;
  email: string;
  displayName: string;
  role: UserRole;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: string;
  lastLoginAt: string | null;
};

export type Preferences = {
  theme: 'light' | 'dark' | 'system';
  reducedMotion: boolean;
  uiDensity: 'comfortable' | 'compact';
  dailyGoalMinutes: number;
  defaultDifficulty: Difficulty;
  showSolutionsByDefault: boolean;
  aiAssistantEnabled: boolean;
};

export type SessionPayload = { user: User | null; preferences: Preferences | null };

/* -------------------------------------------------------------- curriculum */

export type DomainSummary = {
  id: number;
  slug: string;
  name: string;
  summary: string;
  orderIndex: number;
  subdomainCount: number;
  topicCount: number;
};

export type TopicLight = {
  id: number;
  slug: string;
  name: string;
  difficulty: Difficulty;
  definition: string;
  subdomainId: number;
  subdomainName: string;
  estMinutes: number;
  lessonCount: number;
  exerciseCount: number;
};

export type TopicRelation = {
  slug: string;
  name: string;
  difficulty: Difficulty;
  kind: RelationKind;
  note: string | null;
  direction: 'requires' | 'unlocks' | 'lateral';
};

export type FurtherReading = {
  title: string;
  authors: string | null;
  year: number | null;
  type: string;
  url: string | null;
  note: string | null;
};

export type TopicDetail = {
  id: number;
  slug: string;
  name: string;
  difficulty: Difficulty;
  status: string;
  definition: string;
  explanation: string;
  learningObjectives: string[];
  keyResults: string[];
  mathFoundations: string[];
  applications: string[];
  misconceptions: string[];
  openProblems: string | null;
  historyNote: string | null;
  estMinutes: number;
  tags: string[];
  breadcrumb: { slug: string; name: string; type: 'domain' | 'subdomain' }[];
  relations: TopicRelation[];
  furtherReading: FurtherReading[];
  lessons: { slug: string; title: string; courseSlug: string; courseTitle: string; estMinutes: number }[];
  exercises: { slug: string; title: string; difficulty: Difficulty; kind: string }[];
  resources: { slug: string; title: string; type: string; url: string; authors: string; year: number | null }[];
  relatedPaths: { slug: string; name: string }[];
};

export type DomainTree = {
  domain: { slug: string; name: string; summary: string };
  subdomains: { slug: string; name: string; summary: string; topics: TopicLight[] }[];
};

export type GraphNode = {
  id: number;
  slug: string;
  name: string;
  difficulty: Difficulty;
  subdomainSlug: string;
  subdomainName: string;
  domainSlug: string;
  estMinutes: number;
};

export type GraphEdge = { source: number; target: number; kind: RelationKind };

export type TopicGraph = { nodes: GraphNode[]; edges: GraphEdge[] };

export type Neighborhood = TopicGraph & { center: string | null };

export type CurriculumStats = {
  domains: number;
  subdomains: number;
  topics: number;
  relations: number;
  courses: number;
  lessons: number;
  exercises: number;
  resources: number;
  paths: number;
  events: number;
};

export type TopicPage = { topics: TopicLight[] } & PageMeta;

/* --------------------------------------------------------------- dashboard */

export type ContinueLearningEntry = {
  lessonSlug: string;
  lessonTitle: string;
  courseSlug: string;
  courseTitle: string;
  estMinutes: number;
  position: { maxScroll: number; lastBlockIndex: number };
  completedAt: string;
  updatedAt: string;
  nextLesson: { slug: string; title: string; estMinutes: number } | null;
};

export type ActivePathEntry = {
  slug: string;
  name: string;
  status: string;
  startedAt: string;
  goalDate: string | null;
  stageCount: number;
  topicCount: number;
  topicsDone: number;
  progressPercent: number;
  currentStage: string | null;
  stages: { title: string; topicCount: number; doneCount: number }[];
};

export type RecommendedTopic = {
  slug: string;
  name: string;
  difficulty: Difficulty;
  domain: string;
  subdomain: string;
  estMinutes: number;
  pathCount: number;
  reasons: string[];
};

export type MasterySummary = {
  byLevel: Record<MasteryLevel, number>;
  weakest: { slug: string; name: string; score: number; level: string; attempts: number }[];
};

export type ActivitySummary = {
  dailyGoalMinutes: number;
  last14Days: { day: string; minutes: number }[];
  weeklyMinutes: number;
  weeklyGoalPercent: number;
  currentStreakDays: number;
  totalHours: number;
};

export type SavedRecently = {
  bookmarks: { slug: string; title: string; type: string; savedAt: string }[];
  notes: {
    id: number;
    body: string;
    updatedAt: string;
    entitySlug: string | null;
    entityTitle: string | null;
    entityType: string;
  }[];
};

export type DashboardStats = Record<string, number>;

export type LearnerDashboard = {
  authenticated: true;
  continueLearning: ContinueLearningEntry[];
  activePaths: ActivePathEntry[];
  recommendedTopics: RecommendedTopic[];
  masterySummary: MasterySummary;
  activity: ActivitySummary;
  upcomingEvents: CompetitionRow[];
  savedRecently: SavedRecently;
  curriculumStats: DashboardStats;
};

export type PublicDashboard = {
  authenticated: false;
  stats: DashboardStats;
  entryPoints: {
    slug: string;
    name: string;
    summary: string;
    difficulty: Difficulty;
    estHours: number;
    isFeatured: boolean;
  }[];
};

export type Dashboard = LearnerDashboard | PublicDashboard;

/* ------------------------------------------------------------------ events */

export type CompetitionRow = {
  id: number;
  slug: string;
  name: string;
  organizer: string;
  type: string;
  url: string;
  summary: string;
  requirements: string;
  skillsPracticed: string[];
  difficulty: Difficulty;
  startDate: string | null;
  deadlineDate: string | null;
  location: string;
  status: string;
  /** Always false: the events corpus is curated by hand, never fetched live. */
  isLiveData: false;
  sourceUpdatedAt: string;
};

export type CompetitionDetail = CompetitionRow & {
  relatedTopics: { slug: string; name: string; difficulty: Difficulty }[];
};

export type EventsPage = { events: CompetitionRow[]; isLiveData: false; disclaimer: string } & PageMeta;

export type EventCalendar = {
  from: string;
  to: string;
  days: number;
  isLiveData: false;
  disclaimer: string;
  months: { month: string; label: string; items: CompetitionRow[] }[];
};

/* ----------------------------------------------------------------- courses */

export type CourseListItem = {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  summary: string;
  difficulty: Difficulty;
  estHours: number;
  author: string;
  isFeatured: boolean;
  moduleCount: number;
  lessonCount: number;
  topicCount: number;
  enrolled: boolean;
  completedLessons: number;
  progress: number;
  nextLessonSlug: string | null;
};

export type CoursePage = { courses: CourseListItem[] } & PageMeta;

export type OutlineLesson = {
  slug: string;
  title: string;
  summary: string;
  status: string;
  estMinutes: number;
  orderIndex: number;
  blockCount: number;
  completed: boolean;
  completedAt: string | null;
  maxScroll: number;
  lastBlockIndex: number;
};

export type OutlineModule = {
  id: number | null;
  title: string;
  summary: string;
  orderIndex: number;
  lessons: OutlineLesson[];
};

export type CourseDetail = {
  course: {
    slug: string;
    title: string;
    subtitle: string;
    summary: string;
    difficulty: Difficulty;
    status: string;
    estHours: number;
    author: string;
    audience: string;
    objectives: string[];
    prerequisitesNote: string;
    completionCriteria: string;
    isFeatured: boolean;
  };
  topics: { slug: string; name: string; difficulty: Difficulty; estMinutes: number }[];
  modules: OutlineModule[];
  totals: { lessons: number; completed: number };
  enrollment: {
    enrolled: true;
    startedAt: string;
    completedAt: string | null;
    lastLessonId: number | null;
  } | null;
};

/* ----------------------------------------------------------------- lessons */

export type BlockType =
  | 'heading'
  | 'prose'
  | 'list'
  | 'callout'
  | 'math'
  | 'derivation'
  | 'worked_example'
  | 'definition'
  | 'theorem'
  | 'code'
  | 'exercise'
  | 'quiz'
  | 'image'
  | 'table'
  | 'quote'
  | 'interactive'
  | 'comparison'
  | 'timeline'
  | 'reference'
  | 'checklist'
  | 'tabs';

/** Choice text only: per-option `feedback` explains the key and is withheld until an attempt is graded. */
export type ReaderExerciseOption = { label: string; text: string };

/** Learner-safe exercise projection: the server never sends solutions or answer specs here. */
export type ReaderExercise = {
  slug: string;
  kind: string;
  difficulty: Difficulty;
  title: string;
  prompt: string;
  context: string;
  points: number;
  answerNote: string;
  hintCount: number;
  status: string;
  options: ReaderExerciseOption[];
};

export type ReaderBlock = {
  index: number;
  type: BlockType;
  text: string;
  payload: Record<string, unknown>;
  exercise: ReaderExercise | null;
};

export type LessonReader = {
  lesson: {
    slug: string;
    title: string;
    summary: string;
    status: string;
    estMinutes: number;
    orderIndex: number;
    course: { slug: string; title: string; difficulty: Difficulty; status: string };
    module: { id: number; title: string; orderIndex: number } | null;
    topics: { slug: string; name: string }[];
    blocks: ReaderBlock[];
    references: {
      position: number;
      title: string;
      authors: string | null;
      year: number | null;
      type: string;
      url: string | null;
      note: string | null;
    }[];
    prev: { id: number; slug: string; title: string; status: string } | null;
    next: { id: number; slug: string; title: string; status: string } | null;
    bookmarked: boolean;
    completion: {
      completed: true;
      source: 'manual' | 'exercise' | 'quiz';
      completedAt: string;
      maxScroll: number;
      lastBlockIndex: number;
      durationSeconds: number;
    } | null;
    maxScroll: number;
    lastBlockIndex: number;
    blockCount: number;
    staffEditable: boolean;
  };
};

export type ReadingPosition = {
  lessonSlug: string;
  maxScroll: number;
  lastBlockIndex: number;
  updatedAt: string;
  completed: boolean;
  minutesRecorded: number;
};

export type LessonCompletion = {
  lessonSlug: string;
  completed: boolean;
  withdrawn?: boolean;
  source?: 'manual' | 'exercise' | 'quiz';
  completedAt?: string;
  alreadyCompleted?: boolean;
  maxScroll?: number;
  lastBlockIndex?: number;
};

/* ------------------------------------------------------------------ paths */

export type PathEnrollmentStatus = 'active' | 'paused' | 'completed' | 'abandoned';

export type PathProgress = {
  topicsTotal: number;
  topicsProficient: number;
  lessonsTotal: number;
  lessonsDone: number;
  percent: number;
};

export type PathListItem = {
  id: number;
  slug: string;
  name: string;
  summary: string;
  audience: string;
  difficulty: Difficulty;
  estHours: number;
  isFeatured: boolean;
  topicCount: number;
  courseCount: number;
  enrolled: boolean;
  status: PathEnrollmentStatus | null;
  progress: number;
};

export type PathPage = { paths: PathListItem[] } & PageMeta;

export type PathStageItem = {
  kind: 'topic' | 'course';
  slug: string;
  title: string;
  summary: string;
  estMinutes: number;
  optional: boolean;
  note: string | null;
  done: boolean;
  level: MasteryLevel | null;
};

export type PathStage = {
  id: number | null;
  title: string;
  summary: string;
  orderIndex: number;
  items: PathStageItem[];
};

export type PathDetail = {
  path: {
    slug: string;
    name: string;
    summary: string;
    description: string;
    audience: string;
    difficulty: Difficulty;
    estHours: number;
    status: PublishStatus;
    objectives: string[];
    completionCriteria: string;
    prerequisitesNote: string;
    outcomeNote: string;
    isFeatured: boolean;
  };
  prerequisites: { slug: string; name: string; difficulty: Difficulty }[];
  stages: PathStage[];
  progress: PathProgress | null;
  enrollment: {
    status: PathEnrollmentStatus;
    startedAt: string;
    goalDate: string | null;
    completedAt: string | null;
  } | null;
};

export type MyPathEnrollment = {
  id: number;
  slug: string;
  name: string;
  difficulty: Difficulty;
  estHours: number;
  status: PathEnrollmentStatus;
  startedAt: string;
  goalDate: string | null;
  completedAt: string | null;
  progress: PathProgress | null;
};

export type MyPaths = { enrollments: MyPathEnrollment[] };

/* ------------------------------------------------------------------- arena */

export type ExerciseKind =
  | 'single_choice'
  | 'multi_choice'
  | 'true_false'
  | 'numeric'
  | 'short_answer'
  | 'expression'
  | 'derivation'
  | 'code'
  | 'match';

export type ArenaTopicRef = { slug: string; name: string };

export type ArenaExerciseListItem = {
  slug: string;
  kind: ExerciseKind;
  difficulty: Difficulty;
  title: string;
  prompt: string;
  points: number;
  status: PublishStatus;
  topic: ArenaTopicRef | null;
  lessonSlug: string | null;
  hintCount: number;
  attempts: number;
  bestScore: number | null;
  lastResult: boolean | null;
};

export type ArenaExercisePage = { exercises: ArenaExerciseListItem[] } & PageMeta;

/** Only the fields a learner needs to answer well: tolerance, units, match columns — never `expected`. */
export type ArenaAnswerSpec = {
  matchMode: string | null;
  tolerance: number;
  unit: string | null;
  pairCount: number;
  starter: string;
  language: string | null;
  match: { lefts: string[]; rights: string[] } | null;
};

/** A locked hint carries no text; an unlocked one is shown again on every visit. */
export type ArenaHintSlot = { position: number; unlocked: boolean; text: string | null };

export type ArenaAttemptHistoryItem = {
  id: number;
  attemptIndex: number;
  hintsUsed: number;
  score: number;
  isCorrect: boolean | null;
  durationSeconds: number | null;
  feedback: string;
  createdAt: string;
};

export type ArenaExerciseDetail = {
  exercise: {
    slug: string;
    kind: ExerciseKind;
    difficulty: Difficulty;
    title: string;
    prompt: string;
    context: string;
    answerNote: string;
    points: number;
    status: PublishStatus;
    answerSpec: ArenaAnswerSpec;
    options: ArenaExerciseOption[];
    hints: { count: number; available: ArenaHintSlot[] };
    tags: string[];
    topic: ArenaTopicRef | null;
    lesson: { slug: string; title: string } | null;
    topics: string[];
    relatedTopics: ArenaTopicRef[];
    attempts: ArenaAttemptHistoryItem[];
  };
};

export type ArenaExerciseOption = { label: string; text: string };

export type HintUnlockResult = {
  exerciseSlug: string;
  index: number;
  text: string;
  unlockedPositions: ArenaHintSlot[];
  appliedToNextAttempt: boolean;
  note: string;
};

export type OptionFeedback = {
  label: string;
  text: string;
  correct: boolean;
  chosen: boolean;
  feedback: string | null;
};

export type AttemptResult = {
  attempt: {
    id: number;
    attemptIndex: number;
    hintsUsed: number;
    score: number;
    isCorrect: boolean | null;
    hintDiscount: number;
  };
  isCorrect: boolean | null;
  score: number;
  maxPoints: number;
  awardedPoints: number;
  feedback: string;
  optionFeedback: OptionFeedback[];
  explanationShownOnlyIfCorrect: boolean;
  explanation: string | null;
  modelSolution: string | null;
  needsReview: boolean;
  sandboxNote: string | null;
  nextAction: 'await_review' | 'next_exercise' | 'retry';
};

export type AttemptListItem = {
  id: number;
  exerciseSlug: string;
  exerciseTitle: string;
  kind: string;
  difficulty: Difficulty;
  topicSlug: string | null;
  attemptIndex: number;
  hintsUsed: number;
  score: number;
  isCorrect: boolean | null;
  durationSeconds: number | null;
  feedback: string;
  createdAt: string;
};

export type AttemptPage = { attempts: AttemptListItem[] } & PageMeta;

export type MasteryExtreme = {
  slug: string;
  name: string;
  level: MasteryLevel;
  score: number;
  attempts: number;
};

export type ArenaStats = {
  totals: {
    attempts: number;
    exercisesTouched: number;
    correct: number;
    accuracy: number;
    awaitingReview: number;
    hintsUsedOnAttempts: number;
    hintUnlocks: number;
  };
  byDifficulty: Array<{
    difficulty: Difficulty;
    attempts: number;
    correct: number;
    awaitingReview: number;
    hintsUsed: number;
    accuracy: number;
  }>;
  weakestTopics: MasteryExtreme[];
  strongestTopics: MasteryExtreme[];
};

export type RecommendedExercise = {
  slug: string;
  title: string;
  kind: ExerciseKind;
  difficulty: Difficulty;
  points: number;
  topic: ArenaTopicRef | null;
  attempts: number;
  reason: string;
};

export type ArenaRecommendations = {
  recommended: RecommendedExercise[];
  basedOnDifficulty: Difficulty;
};

/* ----------------------------------------------------------------- library */

export type ResourceType =
  | 'paper'
  | 'book'
  | 'survey'
  | 'course'
  | 'video'
  | 'docs'
  | 'repository'
  | 'tutorial'
  | 'dataset'
  | 'tool'
  | 'lecture-notes'
  | 'blog'
  | 'standard';

export type ResourceSummary = {
  id: number;
  slug: string;
  title: string;
  description: string;
  type: ResourceType;
  url: string;
  authors: string;
  publisher: string;
  publishedYear: number | null;
  sourceName: string;
  difficulty: Difficulty;
  estMinutes: number | null;
  isCurated: boolean;
  verified: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  topics: string[];
  bookmarked: boolean;
};

export type ResourceDetail = ResourceSummary & {
  relatedTopics: Array<{ slug: string; name: string; difficulty: Difficulty }>;
  tags: string[];
  similar: Array<{ slug: string; title: string; type: ResourceType; sharedTopics: number }>;
  appearsInCollections: Array<{ slug: string; title: string; kind: string }>;
};

export type ResourcePage = { items: ResourceSummary[] } & PageMeta;

export type Facet = { value: string; count: number };

export type ResourceFacets = { types: Facet[]; difficulties: Facet[] };

export type CuratedCollection = {
  slug: string;
  title: string;
  description: string;
  kind: string;
  itemCount: number;
  updatedAt: string;
};

export type CuratedCollectionItem = {
  position: number;
  note: string;
  slug: string;
  title: string;
  type: ResourceType;
  authors: string;
  publisher: string;
  publishedYear: number | null;
  url: string;
  difficulty: Difficulty;
};

export type CuratedCollectionDetail = CuratedCollection & { items: CuratedCollectionItem[] };

export type UserCollection = {
  id: number;
  title: string;
  description: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
};

export type UserCollectionItem = {
  position: number;
  note: string;
  slug: string;
  title: string;
  type: ResourceType;
  url: string;
  authors: string;
  difficulty: Difficulty;
};

export type BookmarkResult = { slug: string; bookmarked: boolean };

/* ---------------------------------------------------------------- research */

/**
 * Derived from the real taxonomy (a subdomain plus corpus counts), not a hand-maintained feed,
 * so the numbers shown here are always the numbers the library actually holds.
 */
export type ResearchArea = {
  slug: string;
  name: string;
  summary: string;
  domainSlug: string;
  domainName: string;
  topicCount: number;
  resourceCount: number;
};

/** Papers and surveys only, with authors/publisher/year/url recorded verbatim from the source. */
export type ResearchPaper = {
  slug: string;
  title: string;
  description: string;
  type: string;
  authors: string;
  publisher: string;
  year: number | null;
  url: string;
  difficulty: Difficulty;
  sourceName: string;
  verified: boolean;
};

export type ResearchPaperPage = { papers: ResearchPaper[] } & PageMeta;

export type Milestone = {
  id: number;
  /** YYYY, YYYY-MM or YYYY-MM-DD exactly as curated; never padded into a date we do not have. */
  occurredOn: string;
  title: string;
  summary: string;
  kind: string;
  url: string | null;
  sourceName: string;
  topicSlug: string | null;
  topicName: string | null;
  /** Hard product rule: this list is curated by hand, and the payload says so. */
  isCurated: true;
  curatedAt: string;
};

export type MilestoneResponse = { isCurated: true; milestones: Milestone[] };

export type MustReads = {
  mustRead: CuratedCollectionDetail | null;
  frontier: CuratedCollectionDetail | null;
};

/* --------------------------------------------------------------- progress */

/** Aggregates derived from the learner's own rows: completions, graded attempts, activity log. */
export type ProgressTotals = {
  lessonsDone: number;
  exercisesAttempted: number;
  attempts: number;
  correctAttempts: number;
  /** 0..1 over graded attempts; 0 when nothing has been graded yet. */
  accuracy: number;
  hintsUsed: number;
  topicsTouched: number;
  minutesWeek: number;
  minutesToday: number;
  daysActiveWeek: number;
  dailyGoalMinutes: number;
};

export type ProgressStreak = { current: number; longest: number; todayActive: boolean };

export type LevelCount = { level: MasteryLevel; count: number };

export type ReviewItem = {
  slug: string;
  name: string;
  level: MasteryLevel;
  score: number;
  lastTouchedAt: string | null;
};

export type ProgressOverview = {
  overview: ProgressTotals;
  levels: LevelCount[];
  streak: ProgressStreak;
  dueForReview: ReviewItem[];
};

/** The stored mastery columns, rendered server-side into "why this level" (ADR-0003). */
export type MasteryWhy = {
  coverage: number;
  performance: number;
  retention: number;
  score: number;
  attempts: number;
  lessonsDone: number;
  lastTouchedAt: string | null;
  level: MasteryLevel;
  reasons: string[];
};

export type MasteryListItem = MasteryWhy & {
  topicSlug: string;
  topicName: string;
  difficulty: Difficulty;
  subdomainName: string;
  domainName: string;
  needsRevalidation: boolean;
};

export type MasteryListPage = { mastery: MasteryListItem[] } & PageMeta;

export type MasteryDetail = {
  topicSlug: string;
  topicName: string;
  difficulty: Difficulty;
  mastery: MasteryWhy;
  why: string[];
  evidence: {
    lessons: { total: number; done: number; lastCompletionAt: string | null };
    attempts: { at: string; correct: boolean | null; score: number; hintsUsed: number }[];
  };
};

export type ActivityDay = { day: string; minutes: number; actions: number };

export type ActivityPayload = { days: ActivityDay[]; from: string };

export type ProgressPathStage = {
  stageId: number | null;
  title: string;
  topicsTotal: number;
  topicsDone: number;
  lessonsTotal: number;
  lessonsDone: number;
};

export type ProgressPath = {
  slug: string;
  name: string;
  status: PathEnrollmentStatus;
  startedAt: string | null;
  goalDate: string | null;
  stages: ProgressPathStage[];
};

export type ProgressPaths = { paths: ProgressPath[] };

/** Personal-data export: every row this account owns. */
export type ProgressExport = {
  exportedAt: string;
  mastery: Record<string, unknown>[];
  lessonCompletions: Record<string, unknown>[];
  exerciseAttempts: Record<string, unknown>[];
  activity: Record<string, unknown>[];
  notes: Record<string, unknown>[];
  totals: Record<string, number>;
};

/* ------------------------------------------------------------------ search */

/** The entity families `GET /search` can return, in the order the server groups them. */
export type SearchEntityType = 'topics' | 'lessons' | 'resources' | 'exercises' | 'paths' | 'courses' | 'collections';
export type SearchScope = 'all' | SearchEntityType;

export const SEARCH_SCOPES: SearchScope[] = [
  'all',
  'topics',
  'lessons',
  'resources',
  'exercises',
  'paths',
  'courses',
  'collections'
];

export type SearchHit = {
  type: SearchEntityType;
  slug: string;
  title: string;
  /** FTS `snippet()` excerpt (or a plain substring in fallback mode); may be an empty string. */
  snippet: string;
  context: string | null;
  difficulty: Difficulty | null;
  /** bm25 cost — lower is a better match. */
  score: number;
};

export type SearchGroup = { type: SearchEntityType; label: string; count: number; items: SearchHit[] };

/**
 * `groups` re-groups only the page that was just fetched; with no `total` in the payload, pages are
 * accumulated by the caller and re-grouped locally (see `groupSearchHits` in lib/search.ts).
 */
export type SearchResponse = {
  hits: SearchHit[];
  groups: SearchGroup[];
  /** True when the ranked full-text channel produced nothing (or could not parse) and LIKE was used. */
  usedFallback: boolean;
  tookMs: number;
  query: { q: string; scope: SearchScope; page: number; limit: number };
};

/* ------------------------------------------------------------------- notes */

export type NoteTargetKind = 'lesson' | 'topic' | 'resource' | 'course';

export type NoteItem = {
  id: number;
  body: string;
  quote: string;
  blockId: number | null;
  target: { kind: NoteTargetKind; slug: string; title: string };
  createdAt: string;
  updatedAt: string;
};

export type NotePage = { notes: NoteItem[] } & PageMeta;

export type BookmarkItem = { kind: 'lesson' | 'topic' | 'resource'; slug: string; title: string; created_at: string };

export type BookmarkList = { bookmarks: BookmarkItem[] };

/* ------------------------------------------------------------- assistant */

export type AiContextKind = 'general' | 'topic' | 'lesson' | 'exercise' | 'path' | 'course';

export type AssistantStatus = {
  configured: boolean;
  enabledForUser: boolean;
  provider: { name: string; adapter: string; model: string; source: 'database' | 'env' } | null;
  /** Server-written explanation when the assistant has no provider; empty when it does. */
  note: string;
  rateLimitPerMinute: number;
  usage: { calls: number; failures: number; tokensPrompt: number; tokensCompletion: number } | null;
};

export type AssistantMessage = {
  id: number;
  role: 'system' | 'user' | 'assistant';
  content: string;
  model: string | null;
  /** Set on a turn where the provider failed; content is then empty. */
  error: string | null;
  createdAt: string;
};

export type AssistantThread = {
  id: number;
  title: string;
  context: { kind: AiContextKind; slug: string | null; title: string | null } | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AssistantThreadPage = { conversations: AssistantThread[] } & PageMeta;

export type AssistantThreadDetail = { conversation: AssistantThread; messages: AssistantMessage[] };

export type AssistantAskResponse = {
  conversation: AssistantThread;
  message: AssistantMessage;
  provider: string;
  latencyMs: number;
};

/* --------------------------------------------------------- content studio */

/**
 * Descriptor-driven content editing. The server owns the vocabulary of field types and child shapes;
 * nothing here names a database column, and no page is written per content type.
 */

export type AdminFieldType =
  | 'text'
  | 'textarea'
  | 'slug'
  | 'url'
  | 'select'
  | 'number'
  | 'boolean'
  | 'string-list'
  | 'json'
  | 'date'
  | 'ref';

export type AdminFieldSpec = {
  key: string;
  label: string;
  type: AdminFieldType;
  required: boolean;
  max: number | null;
  min: number | null;
  options: string[] | null;
  hint: string | null;
  target: string | null;
  default: unknown;
  integer: boolean;
};

export type AdminRelationSpec = { key: string; label: string; shape: string };

export type AdminKindSpec = {
  kind: string;
  /** Plural section name, e.g. `Lessons`, taken from the same table the overview labels use. */
  label: string;
  hasSlug: boolean;
  statuses: string[] | null;
  consequence: string;
  fields: AdminFieldSpec[];
  relations: AdminRelationSpec[];
  listCounts: { key: string; label: string }[];
};

export type AdminKindsResponse = {
  kinds: AdminKindSpec[];
  itemShapes: Record<string, AdminFieldSpec[]>;
  /** Which provider wire formats the server can speak; the form offers these and nothing else. */
  providerAdapters: string[];
};

export type ContentListRow = {
  id: number;
  slug: string | null;
  title: string;
  status: string | null;
  updatedAt: string | null;
  counts: Record<string, number>;
};

export type ContentListPage = { items: ContentListRow[] } & PageMeta;

export type ContentDocument = {
  meta: {
    id: number;
    slug: string | null;
    title: string;
    status: string | null;
    createdAt: string;
    updatedAt: string | null;
  };
  doc: Record<string, unknown>;
};

export type ContentSaveResult = { id: number; ref: string };

export type RefOption = { value: string; label: string };

export type LessonRevision = { id: number; createdAt: string; editor: string; note: string; blockCount: number };

export type LessonRevisionDetail = LessonRevision & {
  lesson: { title: string; summary: string; status: string; estimatedMinutes: number };
  blocks: { type: string; text: string; payload: unknown }[];
};

export type AdminOverview = {
  content: {
    kind: string;
    label: string;
    total: number;
    /** Null for the types the platform never publishes or un-publishes. */
    published: number | null;
    unpublished: number | null;
    statuses: { status: string; count: number }[];
  }[];
  people: { learners: number; staff: number; active: number };
  assistant: { configured: boolean; providers: number; enabled: number };
  recent: { id: number; at: string; who: string; action: string; kind: string }[];
  health: { key: string; label: string; kind: string; count: number; note: string }[];
};

export type AdminChange = { id: number; at: string; actor: string; kind: string; ref: string; action: string; summary: string };

export type ProviderConfig = {
  id: number;
  name: string;
  adapter: string;
  baseUrl: string;
  model: string;
  /** Whether a secret is stored, and a trailing fragment: the key itself never crosses the wire. */
  keyStored: boolean;
  keyHint: string | null;
  isEnabled: boolean;
  priority: number;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
};

export type ProviderTestResult = { ok: true; model: string; excerpt: string; latencyMs: number };

/** What the provider form writes. A blank `apiKey` means "keep the stored one". */
export type ProviderDraft = {
  name: string;
  adapter: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  isEnabled: boolean;
  priority: number;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
};

export type AdminAccount = {
  id: number;
  email: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  sessions: number;
  createdAt: string;
  lastLoginAt: string | null;
};

export type AdminAccountPage = { total: number; items: AdminAccount[] };
