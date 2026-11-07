import { z } from 'zod';
import { ApiError } from '../../lib/http.js';
import { blockTypes, difficultySchema, exerciseKindSchema, resourceTypeSchema, slugSchema } from '../../lib/domain.js';

/**
 * The Content Studio edits rows in the curriculum tables the whole product reads from. Rather than
 * nine near-identical CRUD stacks, each editable table is described here once: which columns a
 * writer may touch, what shape each column holds, and which child tables belong to the document.
 * The repository builds its SQL from these descriptors, so a column can only be written if a
 * descriptor names it — request bodies never reach SQL as identifiers.
 */

export type FieldType =
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

export type RefTarget = 'courses' | 'topics' | 'lessons' | 'resources' | 'course_modules' | 'subdomains';

export type AdminField = {
  /** Key in the JSON document. */
  key: string;
  /** Column it maps to; defaults to `key`. */
  column?: string;
  label: string;
  type: FieldType;
  required?: boolean;
  max?: number;
  min?: number;
  /** Only for `select`: the accepted values. */
  options?: readonly string[];
  hint?: string;
  default?: unknown;
  /** Only for `number` with a non-integer step, and for the bounds a learner-facing page assumes. */
  integer?: boolean;
  /** Only for `ref`: the table whose slug is stored as a foreign key. */
  target?: RefTarget;
};

/** Child tables rewritten together with the parent row, inside one transaction. */
export type ItemShape =
  | 'block'
  | 'reference'
  | 'option'
  | 'hint'
  | 'prerequisite'
  | 'topic-link'
  | 'collection-item'
  | 'path-topic'
  | 'module';

export type AdminRelation = {
  key: string;
  label: string;
  table: string;
  /** Column on the child table pointing at the parent id. */
  fk: string;
  shape: ItemShape;
  /** How ordering is stored, when the table has an order at all. */
  position?: 'order_index' | 'position';
  /** topic-link only: the foreign key on the other side. */
  other?: string;
};

export type AdminKind = {
  kind: string;
  /** Section name shown to staff; plural because it labels a list. */
  label: string;
  table: string;
  /** Column shown as the row title in lists. */
  title: string;
  /** Column used to look a row up in the editor; `id` for tables without a slug. */
  slugColumn?: string;
  statusColumn?: string;
  statuses?: readonly string[];
  /** Column kept in step with `updated_at`, absent on append-only tables. */
  updatedColumn?: boolean;
  /** Text shown above the editor so staff know what a change costs. */
  consequence: string;
  fields: AdminField[];
  relations: AdminRelation[];
  /**
   * Rules a per-field type cannot express, such as "this answer key matches this question kind".
   * Paths are dotted so the form shows them beside the control they belong to.
   */
  check?: (doc: Record<string, unknown>) => { path: string; message: string }[];
  /** Extra counts shown in the list, computed by one correlated subquery each. */
  listCounts?: { key: string; label: string; sql: string }[];
};

const DIFFICULTY_OPTIONS = ['introductory', 'beginner', 'intermediate', 'advanced', 'expert'] as const;
const CONTENT_STATUS = ['draft', 'review', 'published', 'archived'] as const;
const READING_TYPES = ['book', 'paper', 'survey', 'lecture-notes', 'course', 'docs', 'blog', 'repository', 'video'] as const;

const text = (key: string, label: string, extra: Partial<AdminField> = {}): AdminField => ({
  key,
  label,
  type: 'text',
  max: 200,
  ...extra
});

const longText = (key: string, label: string, extra: Partial<AdminField> = {}): AdminField => ({
  key,
  label,
  type: 'textarea',
  max: 20000,
  ...extra
});

const list = (key: string, label: string, extra: Partial<AdminField> = {}): AdminField => ({
  key,
  label,
  type: 'string-list',
  default: [],
  ...extra
});

const difficultyField = (): AdminField => ({
  key: 'difficulty',
  label: 'Difficulty',
  type: 'select',
  options: DIFFICULTY_OPTIONS,
  required: true,
  default: 'intermediate'
});

const statusField = (statuses: readonly string[], def = 'draft'): AdminField => ({
  key: 'status',
  column: 'status',
  label: 'Status',
  type: 'select',
  options: statuses,
  required: true,
  default: def,
  hint: 'Only published rows are visible to learners.'
});

/**
 * Links a content row to topics. `parent` is the column of the join table that names the owning
 * row — `topic_id` is on the other side and is fixed here, so the two are never mixed up.
 */
const TOPIC_LINK = (label: string, table: string, parent: string): AdminRelation => ({
  key: 'topics',
  label,
  table,
  fk: parent,
  shape: 'topic-link',
  other: 'topic_id'
});

export const ADMIN_KINDS: AdminKind[] = [
  {
    kind: 'topic',
    label: 'Topics',
    table: 'topics',
    slugColumn: 'slug',
    title: 'name',
    statusColumn: 'status',
    statuses: CONTENT_STATUS,
    updatedColumn: true,
    consequence: 'Topics are the map of the field: explore pages, prerequisites and mastery all read this row.',
    fields: [
      text('name', 'Name', { required: true, max: 160 }),
      { key: 'slug', label: 'Slug', type: 'slug', required: true },
      { key: 'subdomain', label: 'Subdomain', type: 'ref', target: 'subdomains', column: 'subdomain_id', required: true },
      difficultyField(),
      longText('definition', 'Definition', { required: true, max: 2000, hint: 'One paragraph. Shown at the top of the topic page.' }),
      longText('explanation', 'Explanation', { max: 20000 }),
      list('learningObjectives', 'Learning objectives'),
      list('keyResults', 'Key results'),
      list('mathFoundations', 'Math foundations'),
      list('applications', 'Applications'),
      list('misconceptions', 'Misconceptions'),
      longText('openProblems', 'Open problems', { max: 4000 }),
      longText('historyNote', 'History note', { max: 4000 }),
      { key: 'estMinutes', label: 'Estimated minutes', type: 'number', integer: true, min: 0, max: 600, default: 30 },
      list('tags', 'Tags'),
      statusField(CONTENT_STATUS, 'published')
    ],
    relations: [
      { key: 'furtherReading', label: 'Further reading', table: 'topic_further_reading', fk: 'topic_id', shape: 'reference', position: 'position' },
      { key: 'prerequisites', label: 'Prerequisites', table: 'topic_relations', fk: 'topic_id', shape: 'prerequisite' }
    ],
    listCounts: [
      { key: 'lessons', label: 'lessons', sql: '(SELECT COUNT(*) FROM lesson_topics lt WHERE lt.topic_id = k.id)' },
      { key: 'exercises', label: 'exercises', sql: '(SELECT COUNT(*) FROM exercises e WHERE e.topic_id = k.id)' }
    ]
  },
  {
    kind: 'lesson',
    label: 'Lessons',
    table: 'lessons',
    slugColumn: 'slug',
    title: 'title',
    statusColumn: 'status',
    statuses: CONTENT_STATUS,
    updatedColumn: true,
    consequence: 'Every edit writes a revision snapshot first, so a lesson can be read back as it was.',
    fields: [
      text('title', 'Title', { required: true, max: 200 }),
      { key: 'slug', label: 'Slug', type: 'slug', required: true },
      { key: 'course', label: 'Course', type: 'ref', target: 'courses', column: 'course_id', required: true },
      { key: 'module', label: 'Module title', type: 'ref', target: 'course_modules', column: 'module_id', hint: 'Matched against the modules of the selected course.' },
      longText('summary', 'Summary', { max: 600 }),
      { key: 'estMinutes', label: 'Estimated minutes', type: 'number', integer: true, min: 1, max: 600, default: 15 },
      { key: 'orderIndex', label: 'Order in the course', type: 'number', integer: true, min: 0, max: 500, default: 0 },
      statusField(CONTENT_STATUS, 'draft')
    ],
    relations: [
      { key: 'blocks', label: 'Content blocks', table: 'lesson_blocks', fk: 'lesson_id', shape: 'block', position: 'order_index' },
      { key: 'references', label: 'References', table: 'lesson_references', fk: 'lesson_id', shape: 'reference', position: 'position' },
      TOPIC_LINK('Topics taught', 'lesson_topics', 'lesson_id')
    ],
    listCounts: [
      { key: 'blocks', label: 'blocks', sql: '(SELECT COUNT(*) FROM lesson_blocks b WHERE b.lesson_id = k.id)' }
    ]
  },
  {
    kind: 'exercise',
    label: 'Exercises',
    table: 'exercises',
    slugColumn: 'slug',
    title: 'title',
    statusColumn: 'status',
    statuses: ['draft', 'published', 'archived'],
    updatedColumn: true,
    consequence: 'Changing the answer key re-grades nothing: attempts keep the answer given at the time.',
    fields: [
      text('title', 'Title', { required: true, max: 200 }),
      { key: 'slug', label: 'Slug', type: 'slug', required: true },
      {
        key: 'kind',
        label: 'Kind',
        type: 'select',
        options: exerciseKindSchema.options,
        required: true,
        default: 'single_choice',
        hint: 'Decides how the answer is marked.'
      },
      difficultyField(),
      { key: 'topic', label: 'Primary topic', type: 'ref', target: 'topics', column: 'topic_id' },
      { key: 'lesson', label: 'Lesson it follows', type: 'ref', target: 'lessons', column: 'lesson_id' },
      longText('context', 'Context', { max: 6000 }),
      longText('prompt', 'Prompt', { required: true, max: 20000 }),
      {
        key: 'answerSpec',
        label: 'Answer key (JSON)',
        type: 'json',
        default: {},
        hint: 'The grader marks from here. Shape follows the kind: expected for numeric and true/false, accepted for open answers, pairs for matching.'
      },
      longText('solution', 'Full solution', { max: 20000, hint: 'Never sent to the study assistant.' }),
      longText('explanation', 'Explanation', { max: 8000 }),
      text('answerNote', 'Note shown with the answer', { max: 600 }),
      { key: 'points', label: 'Points', type: 'number', integer: true, min: 1, max: 100, default: 10 },
      statusField(['draft', 'published', 'archived'], 'published')
    ],
    relations: [
      { key: 'options', label: 'Options', table: 'exercise_options', fk: 'exercise_id', shape: 'option', position: 'position' },
      { key: 'hints', label: 'Hints', table: 'exercise_hints', fk: 'exercise_id', shape: 'hint', position: 'position' },
      TOPIC_LINK('Also practises', 'exercise_topics', 'exercise_id')
    ],
    check: answerKeyIssues
  },
  {
    kind: 'resource',
    label: 'Resources',
    table: 'resources',
    slugColumn: 'slug',
    title: 'title',
    statusColumn: 'status',
    statuses: ['draft', 'published', 'archived'],
    updatedColumn: true,
    consequence: 'Learners bookmark and cite these; the URL is the whole point, so verify it before publishing.',
    fields: [
      text('title', 'Title', { required: true, max: 200 }),
      { key: 'slug', label: 'Slug', type: 'slug', required: true },
      longText('description', 'Why it is worth the time', { max: 4000 }),
      { key: 'type', label: 'Type', type: 'select', options: resourceTypeSchema.options, required: true, default: 'paper' },
      { key: 'url', label: 'Link', type: 'url', required: true, max: 2000 },
      text('authors', 'Authors', { max: 300 }),
      text('publisher', 'Publisher / venue', { max: 200 }),
      { key: 'publishedYear', label: 'Year', type: 'number', integer: true, min: 1940, max: 2100 },
      text('sourceName', 'Where this was found', { max: 200, hint: 'Attribution for the curators.' }),
      difficultyField(),
      { key: 'estMinutes', label: 'Estimated minutes', type: 'number', integer: true, min: 0, max: 100000 },
      { key: 'isCurated', column: 'is_curated', label: 'Curated by us', type: 'boolean', default: true },
      {
        key: 'verified',
        label: 'Link and claim checked',
        type: 'boolean',
        default: false,
        hint: 'Set only after opening the link and comparing it with the description.'
      },
      statusField(['draft', 'published', 'archived'], 'published')
    ],
    relations: [TOPIC_LINK('Topics', 'resource_topics', 'resource_id')],
    listCounts: [
      { key: 'collections', label: 'collections', sql: '(SELECT COUNT(*) FROM curated_collection_items i WHERE i.resource_id = k.id)' }
    ]
  },
  {
    kind: 'course',
    label: 'Courses',
    table: 'courses',
    slugColumn: 'slug',
    title: 'title',
    statusColumn: 'status',
    statuses: CONTENT_STATUS,
    updatedColumn: true,
    consequence: 'Courses order lessons for every learner already enrolled.',
    fields: [
      text('title', 'Title', { required: true, max: 200 }),
      { key: 'slug', label: 'Slug', type: 'slug', required: true },
      text('subtitle', 'Subtitle', { max: 240 }),
      longText('summary', 'Summary', { max: 4000 }),
      difficultyField(),
      { key: 'estHours', label: 'Estimated hours', type: 'number', min: 1, max: 400, default: 8 },
      text('author', 'Author credit', { max: 120, required: true, default: 'AI Mastery curriculum team' }),
      longText('audience', 'Who it is for', { max: 2000 }),
      list('objectives', 'Objectives'),
      longText('prerequisitesNote', 'Prerequisites', { max: 2000 }),
      longText('completionCriteria', 'What counts as finished', { max: 2000 }),
      { key: 'isFeatured', column: 'is_featured', label: 'Featured on the courses page', type: 'boolean', default: false },
      { key: 'orderIndex', label: 'Order', type: 'number', integer: true, min: 0, max: 200, default: 0 },
      statusField(CONTENT_STATUS, 'draft')
    ],
    relations: [
      TOPIC_LINK('Topics covered', 'course_topics', 'course_id'),
      { key: 'modules', label: 'Modules, in order', table: 'course_modules', fk: 'course_id', shape: 'module', position: 'order_index' }
    ],
    listCounts: [
      { key: 'lessons', label: 'lessons', sql: '(SELECT COUNT(*) FROM lessons l WHERE l.course_id = k.id)' },
      { key: 'modules', label: 'modules', sql: '(SELECT COUNT(*) FROM course_modules m WHERE m.course_id = k.id)' }
    ]
  },
  {
    kind: 'path',
    label: 'Learning paths',
    table: 'learning_paths',
    slugColumn: 'slug',
    title: 'name',
    statusColumn: 'status',
    statuses: ['draft', 'published', 'archived'],
    updatedColumn: true,
    consequence: 'Paths sequence topics and courses; enrolled learners see the change immediately.',
    fields: [
      text('name', 'Name', { required: true, max: 160 }),
      { key: 'slug', label: 'Slug', type: 'slug', required: true },
      longText('summary', 'Summary', { max: 2000 }),
      longText('description', 'Description', { max: 8000 }),
      longText('audience', 'Audience', { max: 2000 }),
      difficultyField(),
      { key: 'estHours', label: 'Estimated hours', type: 'number', integer: true, min: 1, max: 1000, default: 40 },
      list('objectives', 'Objectives'),
      longText('completionCriteria', 'What counts as finished', { max: 2000 }),
      longText('prerequisitesNote', 'Prerequisites', { max: 2000 }),
      longText('outcomeNote', 'What you can do afterwards', { max: 2000 }),
      { key: 'isFeatured', column: 'is_featured', label: 'Featured', type: 'boolean', default: false },
      { key: 'orderIndex', label: 'Order', type: 'number', integer: true, min: 0, max: 100, default: 0 },
      statusField(['draft', 'published', 'archived'], 'published')
    ],
    relations: [
      { key: 'pathTopics', label: 'Topics, in order', table: 'learning_path_topics', fk: 'path_id', shape: 'path-topic', position: 'order_index' }
    ],
    listCounts: [
      { key: 'topics', label: 'topics', sql: '(SELECT COUNT(*) FROM learning_path_topics pt WHERE pt.path_id = k.id)' }
    ]
  },
  {
    kind: 'event',
    label: 'Events and competitions',
    table: 'competitions',
    slugColumn: 'slug',
    title: 'name',
    statusColumn: 'status',
    statuses: ['upcoming', 'open', 'ongoing', 'closed', 'recurring'],
    updatedColumn: true,
    consequence: 'These are curated by hand. The site never claims a date it did not read from the organiser.',
    fields: [
      text('name', 'Name', { required: true, max: 160 }),
      { key: 'slug', label: 'Slug', type: 'slug', required: true },
      text('organizer', 'Organiser', { max: 160, required: true }),
      {
        key: 'type',
        label: 'Type',
        type: 'select',
        options: ['competition', 'challenge', 'hackathon', 'conference', 'workshop', 'grant', 'summit'],
        required: true,
        default: 'competition'
      },
      { key: 'url', label: 'Official link', type: 'url', required: true, max: 2000 },
      longText('summary', 'Summary', { max: 4000 }),
      longText('requirements', 'Requirements', { max: 4000 }),
      text('skillsPracticed', 'Skills practised', { max: 600 }),
      difficultyField(),
      { key: 'startDate', label: 'Start date', type: 'date' },
      { key: 'deadlineDate', label: 'Deadline', type: 'date' },
      text('location', 'Location', { max: 200 }),
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: ['upcoming', 'open', 'ongoing', 'closed', 'recurring'],
        required: true,
        default: 'upcoming'
      }
    ],
    relations: [TOPIC_LINK('Skills practised', 'competition_topics', 'competition_id')],
    listCounts: []
  },
  {
    kind: 'milestone',
    label: 'Milestones',
    table: 'milestones',
    title: 'title',
    updatedColumn: false,
    consequence: 'Milestones are dated claims about the field. Only add one with a source you have read.',
    fields: [
      { key: 'occurredOn', label: 'Date it happened', type: 'date', required: true },
      text('title', 'Title', { required: true, max: 200 }),
      longText('summary', 'Summary', { max: 4000 }),
      {
        key: 'kind',
        label: 'Kind',
        type: 'select',
        options: ['paper', 'model', 'product', 'dataset', 'standard', 'event', 'development'],
        required: true,
        default: 'development'
      },
      { key: 'url', label: 'Source link', type: 'url', max: 2000, required: true },
      text('sourceName', 'Source name', { max: 200, required: true }),
      { key: 'topic', label: 'Related topic', type: 'ref', target: 'topics', column: 'topic_id' }
    ],
    relations: [],
    listCounts: []
  },
  {
    kind: 'collection',
    label: 'Reading lists',
    table: 'curated_collections',
    slugColumn: 'slug',
    title: 'title',
    updatedColumn: true,
    consequence: 'Reading lists are the most-cited pages in Research & Discover.',
    fields: [
      text('title', 'Title', { required: true, max: 160 }),
      { key: 'slug', label: 'Slug', type: 'slug', required: true },
      longText('description', 'Description', { max: 4000 }),
      {
        key: 'kind',
        label: 'Kind',
        type: 'select',
        options: ['reading-list', 'research-topic', 'must-read', 'frontier', 'survey-trail'],
        required: true,
        default: 'reading-list'
      },
      { key: 'orderIndex', label: 'Order', type: 'number', integer: true, min: 0, max: 100, default: 0 }
    ],
    relations: [
      { key: 'items', label: 'Resources, in order', table: 'curated_collection_items', fk: 'collection_id', shape: 'collection-item', position: 'position' }
    ],
    listCounts: [
      { key: 'items', label: 'items', sql: '(SELECT COUNT(*) FROM curated_collection_items i WHERE i.collection_id = k.id)' }
    ]
  }
];

export const KIND_BY_NAME = new Map(ADMIN_KINDS.map((kind) => [kind.kind, kind]));

export function kindOrThrow(kind: string): AdminKind {
  const found = KIND_BY_NAME.get(kind);
  if (!found) throw ApiError.badRequest(`"${kind}" is not an editable content type.`);
  return found;
}

const stringListSchema = z.array(z.string().trim().min(1).max(500)).max(80);

/** zod declares `.default()` per subclass, so a schema picked out of a union needs the base type. */
function withDefault(schema: z.ZodTypeAny, value: unknown): z.ZodTypeAny {
  return (schema as unknown as { default: (def: unknown) => z.ZodTypeAny }).default(value);
}

/**
 * One place where a field description becomes validation rules. Documents and child rows share this
 * vocabulary, which is what lets the Content Studio render both from the descriptor alone.
 */
function fieldSchema(field: AdminField): z.ZodTypeAny {
  const min = field.min ?? 0;
  const base =
    field.type === 'text'
      ? z.string().trim().min(min).max(field.max ?? 200)
      : field.type === 'textarea'
        ? z.string().trim().min(min).max(field.max ?? 20000)
        : field.type === 'slug'
          ? slugSchema
          : field.type === 'url'
            ? z.string().trim().min(min).url().max(field.max ?? 2000)
            : field.type === 'select'
              ? z.enum(field.options as [string, ...string[]])
              : field.type === 'number'
                ? z.coerce
                    .number()
                    .int(field.integer ? 'Whole numbers only.' : undefined)
                    .min(field.min ?? -1e9)
                    .max(field.max ?? 1e9)
                : field.type === 'boolean'
                  ? z.boolean()
                  : field.type === 'string-list'
                    ? stringListSchema
                    : field.type === 'json'
                      ? z.unknown()
                      : field.type === 'date'
                        ? z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.')
                        : z.string().trim().min(min).max(field.max ?? 200);

  if (field.default !== undefined) return withDefault(base, field.default);
  return field.required ? base : base.optional().nullable();
}

export function docSchema(kind: AdminKind): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of kind.fields) shape[field.key] = fieldSchema(field);
  // A relation the body omits is a relation the writer did not mean to touch; `[]` means "clear it".
  for (const relation of kind.relations) shape[relation.key] = itemSchema(relation.shape).array().max(300).optional();
  const base = z.object(shape).strict();
  if (!kind.check) return base;
  return base.superRefine((doc, ctx) => {
    for (const issue of kind.check!(doc as Record<string, unknown>)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: issue.path.split('.'), message: issue.message });
    }
  });
}

/**
 * What the grader needs to be able to mark this question at all, per kind. A wrong answer key is not
 * a formatting problem: the learner submits and the server has nothing to compare against.
 */
function answerKeyIssues(doc: Record<string, unknown>) {
  const issues: { path: string; message: string }[] = [];
  // A draft is allowed to be unfinished; publishing it as it stands is what has to be refused.
  if (doc.status !== undefined && doc.status !== 'published') return issues;
  const spec = (doc.answerSpec ?? {}) as Record<string, unknown>;
  const flag = (message: string) => issues.push({ path: 'answerSpec', message });
  const rows = Array.isArray(doc.options) ? (doc.options as Record<string, unknown>[]) : null;
  const rowMarksRight = rows?.some((row) => row.isCorrect === true) ?? false;
  const specMarksRight =
    Array.isArray(spec.options) &&
    (spec.options as Record<string, unknown>[]).some((entry) => entry.correct === true);

  switch (doc.kind) {
    case 'single_choice':
    case 'multi_choice':
      // An omitted `options` list means the writer did not touch the rows, so only the key can be judged.
      if (rows !== null && !rowMarksRight && !specMarksRight) {
        flag('Mark at least one option as the correct answer, or delete the options you do not want graded.');
      }
      break;
    case 'true_false':
      if (typeof spec.expected !== 'boolean' && !rowMarksRight && !specMarksRight) {
        flag('A true/false answer key is {"kind":"true_false","expected":true} or false — the grader reads it from here.');
      }
      break;
    case 'numeric':
      if (typeof spec.expected !== 'number' || !Number.isFinite(spec.expected)) {
        flag('A numeric answer key needs "expected" as a number, and may add "tolerance" and "unit".');
      }
      break;
    case 'short_answer':
    case 'expression':
      if (!Array.isArray(spec.accepted) || spec.accepted.length === 0 || spec.accepted.some((item) => typeof item !== 'string')) {
        flag('An open-answer key needs "accepted": a non-empty list of the answers that count as correct.');
      }
      break;
    case 'match':
      if (
        !Array.isArray(spec.pairs) ||
        spec.pairs.length === 0 ||
        spec.pairs.some((pair) => typeof pair !== 'object' || pair === null || !('left' in pair) || !('right' in pair))
      ) {
        flag('A matching key needs "pairs": a list of {"left": …, "right": …} entries.');
      }
      break;
    default:
      // derivation and code are marked by a human or a runner, so the key is not machine-checkable here.
      break;
  }
  return issues;
}

/**
 * The child rows each relation shape holds, described with the same field vocabulary as documents.
 * `itemSchema` validates from here and the descriptor publishes here, so a shape the browser can
 * edit is a shape the server accepts — no second list to keep in step.
 */
export const ITEM_SHAPES: Record<ItemShape, AdminField[]> = {
  block: [
    { key: 'type', label: 'Block type', type: 'select', options: blockTypes, required: true },
    { key: 'text', label: 'Text', type: 'textarea', max: 20000, default: '', hint: 'Markdown and $…$ math are rendered as written.' },
    { key: 'payload', label: 'Extra data (JSON)', type: 'json', default: {}, hint: 'Lists, callouts, code and interactives read their settings from here.' }
  ],
  reference: [
    { key: 'title', label: 'Title', type: 'text', min: 1, max: 300, required: true },
    { key: 'authors', label: 'Authors', type: 'text', max: 300 },
    { key: 'year', label: 'Year', type: 'number', integer: true, min: 1900, max: 2100 },
    { key: 'type', label: 'Type', type: 'select', options: READING_TYPES, required: true, default: 'paper' },
    { key: 'url', label: 'Link', type: 'url', max: 2000 },
    { key: 'note', label: 'Why it is here', type: 'text', max: 1000 }
  ],
  option: [
    { key: 'label', label: 'Label', type: 'text', min: 1, max: 8, required: true, hint: 'A, B, C…' },
    { key: 'text', label: 'Option', type: 'text', min: 1, max: 2000, required: true },
    { key: 'isCorrect', label: 'Correct answer', type: 'boolean', default: false },
    { key: 'feedback', label: 'Feedback shown with the answer', type: 'text', max: 1000 }
  ],
  hint: [{ key: 'text', label: 'Hint', type: 'textarea', min: 1, max: 2000, required: true }],
  prerequisite: [
    { key: 'slug', label: 'Topic', type: 'ref', target: 'topics', min: 2, max: 96, required: true },
    { key: 'kind', label: 'How it relates', type: 'select', options: ['strict', 'recommended', 'related', 'extension'], required: true, default: 'recommended' },
    { key: 'note', label: 'Note', type: 'text', max: 600 }
  ],
  'topic-link': [{ key: 'slug', label: 'Topic', type: 'ref', target: 'topics', min: 2, max: 96, required: true }],
  'path-topic': [{ key: 'slug', label: 'Topic', type: 'ref', target: 'topics', min: 2, max: 96, required: true }],
  'collection-item': [
    { key: 'slug', label: 'Resource', type: 'ref', target: 'resources', min: 2, max: 96, required: true },
    { key: 'note', label: 'Why it is in this list', type: 'text', max: 1000, default: '' }
  ],
  module: [
    { key: 'title', label: 'Module title', type: 'text', min: 2, max: 160, required: true },
    { key: 'summary', label: 'Summary', type: 'text', max: 600, default: '' }
  ]
};

export function itemSchema(shape: ItemShape): z.ZodTypeAny {
  const properties: Record<string, z.ZodTypeAny> = {};
  for (const field of ITEM_SHAPES[shape]) properties[field.key] = fieldSchema(field);
  return z.object(properties).strict();
}

/** Defaults are applied before parsing so a create body may omit anything the table already knows. */
export function withDefaults(kind: AdminKind, body: Record<string, unknown>): Record<string, unknown> {
  const doc: Record<string, unknown> = { ...body };
  for (const field of kind.fields) {
    if (doc[field.key] === undefined && field.default !== undefined) doc[field.key] = field.default;
    if (doc[field.key] === undefined && field.type === 'string-list') doc[field.key] = [];
    if (doc[field.key] === '' && (field.type === 'date' || field.type === 'url' || field.type === 'ref')) doc[field.key] = null;
    if (doc[field.key] === undefined && field.type === 'ref') doc[field.key] = null;
  }
  return doc;
}

export const DIFFICULTY = difficultySchema;
