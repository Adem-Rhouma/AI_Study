import { z } from 'zod';
import { blockTypes, DIFFICULTIES, exerciseKinds, resourceTypes } from '../lib/domain.js';

/** Normalised curriculum produced by src/curriculum/build.ts from the research corpus. */
export const curriculumFileSchema = z.object({
  source: z.string(),
  generatedAt: z.string(),
  domains: z
    .array(
      z.object({
        slug: z.string(),
        name: z.string(),
        summary: z.string().default(''),
        order: z.number().int().min(0).default(0),
        subdomains: z
          .array(
            z.object({
              slug: z.string(),
              name: z.string(),
              summary: z.string().default(''),
              order: z.number().int().min(0).default(0),
              topics: z
                .array(
                  z.object({
                    slug: z.string(),
                    name: z.string(),
                    difficulty: z.enum(DIFFICULTIES),
                    definition: z.string().default(''),
                    explanation: z.string().default(''),
                    learningObjectives: z.array(z.string()).default([]),
                    keyResults: z.array(z.string()).default([]),
                    mathFoundations: z.array(z.string()).default([]),
                    applications: z.array(z.string()).default([]),
                    misconceptions: z.array(z.string()).default([]),
                    openProblems: z.string().nullable().default(null),
                    historyNote: z.string().nullable().default(null),
                    estMinutes: z.number().int().min(5).max(2000).default(30),
                    tags: z.array(z.string()).default([]),
                    prerequisitesStrict: z.array(z.string()).default([]),
                    prerequisitesRecommended: z.array(z.string()).default([]),
                    relatedConcepts: z.array(z.string()).default([]),
                    advancedExtensions: z.array(z.string()).default([]),
                    furtherReading: z
                      .array(
                        z.object({
                          title: z.string(),
                          authors: z.string().nullable().default(null),
                          year: z.number().int().min(-3000).max(2100).nullable().default(null),
                          type: z.string().default('paper'),
                          url: z.string().nullable().default(null),
                          note: z.string().nullable().default(null)
                        })
                      )
                      .default([])
                  })
                )
                .default([])
            })
          )
          .default([])
      })
    )
    .default([])
});

export type CurriculumFile = z.infer<typeof curriculumFileSchema>;

/** The subset the lesson_references CHECK constraint accepts; the seeder cannot offer more. */
const readingTypes = [
  'book',
  'paper',
  'survey',
  'lecture-notes',
  'course',
  'docs',
  'blog',
  'repository',
  'video'
] as const;

export const readingEntrySchema = z.object({
  title: z.string().min(2),
  authors: z.string().default(''),
  url: z.string().url().optional(),
  note: z.string().optional(),
  year: z.number().int().min(-3000).max(2100).optional(),
  /** Defaults to paper because most lesson references are papers; books and surveys must say so. */
  type: z.enum(readingTypes).default('paper'),
  /** Recording a URL is not checking a source, so verification has to be claimed explicitly. */
  verified: z.boolean().default(false)
});

export const exercisePayloadSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('single_choice'),
    options: z.array(z.object({ label: z.string(), text: z.string(), correct: z.boolean(), feedback: z.string().optional() })).min(2).max(10)
  }),
  z.object({
    kind: z.literal('multi_choice'),
    options: z.array(z.object({ label: z.string(), text: z.string(), correct: z.boolean(), feedback: z.string().optional() })).min(2).max(10)
  }),
  /** The answer is part of the shape: a true/false with no recorded answer cannot be marked. */
  z.object({ kind: z.literal('true_false'), expected: z.boolean() }),
  z.object({
    kind: z.literal('numeric'),
    expected: z.number(),
    tolerance: z.number().min(0).default(0),
    unit: z.string().optional()
  }),
  z.object({
    kind: z.enum(['short_answer', 'expression']),
    accepted: z.array(z.string()).min(1).max(20),
    matchMode: z.enum(['contains', 'equals', 'regex']).default('contains')
  }),
  z.object({ kind: z.literal('derivation') }),
  z.object({
    kind: z.literal('code'),
    starter: z.string().default(''),
    language: z.string().default('python'),
    tests: z.string().optional()
  }),
  z.object({
    kind: z.literal('match'),
    pairs: z.array(z.object({ left: z.string(), right: z.string() })).min(2).max(12)
  })
]);

/**
 * `answerNote` is rendered before the learner submits, so it may describe the required format or the
 * grading rule and nothing else. These two shapes are how a note leaks the key by accident.
 */
const TRUE_FALSE_LEAK = /\b(?:choose|enter|type|select|answer(?:\s+with)?)\s+(?:true|false)\b(?!\s+or\s)/i;

/** Whole-value match, so "12.5" does not count as a leak of the expected 2.5. */
function statesValue(note: string, value: string): boolean {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\d.])${escaped}(?![\\d.])`, 'i').test(note);
}

export const exerciseFileSchema = z
  .object({
    slug: z.string(),
    title: z.string(),
    kind: z.enum(exerciseKinds),
    difficulty: z.enum(DIFFICULTIES),
    topicSlugs: z.array(z.string()).min(1),
    lessonSlug: z.string().optional(),
    points: z.number().int().min(1).max(100).default(10),
    context: z.string().default(''),
    prompt: z.string().min(1),
    payload: exercisePayloadSchema,
    hints: z.array(z.string()).max(6).default([]),
    solution: z.string().min(1),
    explanation: z.string().min(1),
    answerNote: z.string().default(''),
    tags: z.array(z.string()).default([])
  })
  .superRefine((exercise, ctx) => {
    const note = exercise.answerNote;
    if (!note.trim()) return;
    const leaks =
      TRUE_FALSE_LEAK.test(note) ||
      (exercise.payload.kind === 'numeric' && statesValue(note, String(exercise.payload.expected))) ||
      ((exercise.payload.kind === 'short_answer' || exercise.payload.kind === 'expression') &&
        exercise.payload.accepted.some((value) => value.length > 1 && statesValue(note, value)));
    if (!leaks) return;
    ctx.addIssue({
      code: 'custom',
      path: ['answerNote'],
      message: 'answerNote ships to the browser before the learner submits; state the format or grading rule, never the answer'
    });
  });

export const blockSchema = z.object({
  type: z.enum(blockTypes),
  text: z.string().default(''),
  payload: z.record(z.string(), z.unknown()).default({})
});

export const lessonFileSchema = z.object({
  slug: z.string(),
  title: z.string(),
  summary: z.string().default(''),
  estMinutes: z.number().int().min(2).max(240).default(15),
  topicSlugs: z.array(z.string()).min(1),
  blocks: z.array(blockSchema).min(1),
  references: z.array(readingEntrySchema).default([])
});

export const courseFileSchema = z.object({
  slug: z.string(),
  title: z.string(),
  subtitle: z.string().default(''),
  summary: z.string().min(10),
  difficulty: z.enum(DIFFICULTIES),
  estHours: z.number().min(0.25).max(400).default(4),
  author: z.string().default('AI Mastery'),
  audience: z.string().default(''),
  objectives: z.array(z.string()).default([]),
  prerequisitesNote: z.string().default(''),
  completionCriteria: z.string().default(''),
  topicSlugs: z.array(z.string()).default([]),
  isFeatured: z.boolean().default(false),
  modules: z
    .array(
      z.object({
        title: z.string(),
        summary: z.string().default(''),
        lessons: z.array(lessonFileSchema).min(1)
      })
    )
    .min(1),
  resources: z.array(readingEntrySchema).default([])
});

export const resourceFileSchema = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string().default(''),
  type: z.enum(resourceTypes),
  url: z.string().url(),
  authors: z.string().default(''),
  publisher: z.string().default(''),
  publishedYear: z.number().int().optional(),
  sourceName: z.string().default(''),
  difficulty: z.enum(DIFFICULTIES).default('intermediate'),
  estMinutes: z.number().int().optional(),
  topicSlugs: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  /** Same rule as a lesson citation: a URL in the file is not evidence somebody opened it. */
  verified: z.boolean().default(false)
});

export const pathFileSchema = z.object({
  slug: z.string(),
  name: z.string(),
  summary: z.string(),
  description: z.string().default(''),
  audience: z.string().default(''),
  difficulty: z.enum(DIFFICULTIES),
  estHours: z.number().min(1).max(2000).default(40),
  objectives: z.array(z.string()).default([]),
  completionCriteria: z.string().default(''),
  prerequisitesNote: z.string().default(''),
  outcomeNote: z.string().default(''),
  isFeatured: z.boolean().default(false),
  stages: z
    .array(
      z.object({
        title: z.string(),
        summary: z.string().default(''),
        topicSlugs: z.array(z.string()).default([]),
        courseSlugs: z.array(z.string()).default([]),
        optionalTopicSlugs: z.array(z.string()).default([])
      })
    )
    .min(1)
});

/** Words the events API routes on itself; an event using one would be unreachable. */
const reservedEventSlugs = ['calendar'];

export const competitionFileSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'event slug must be lowercase kebab-case')
    .refine((slug) => !reservedEventSlugs.includes(slug), 'event slug is reserved by the events API routes'),
  name: z.string(),
  organizer: z.string(),
  type: z.enum(['competition', 'challenge', 'hackathon', 'conference', 'workshop', 'grant', 'summit']),
  url: z.string().url(),
  summary: z.string(),
  requirements: z.string().default(''),
  skillsPracticed: z.string().default(''),
  difficulty: z.enum(DIFFICULTIES).default('intermediate'),
  startDate: z.string().optional(),
  deadlineDate: z.string().optional(),
  status: z.enum(['upcoming', 'open', 'ongoing', 'closed', 'recurring']).default('recurring'),
  location: z.string().default(''),
  sourceUpdatedAt: z.string().default(''),
  topicSlugs: z.array(z.string()).default([])
});

export const milestoneFileSchema = z.object({
  occurredOn: z.string(),
  title: z.string(),
  summary: z.string(),
  kind: z.enum(['paper', 'model', 'product', 'dataset', 'standard', 'event', 'development']).default('development'),
  url: z.string().url().optional(),
  sourceName: z.string().default(''),
  topicSlug: z.string().optional()
});

export const collectionFileSchema = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string().default(''),
  kind: z.enum(['reading-list', 'research-topic', 'must-read', 'frontier', 'survey-trail']).default('reading-list'),
  items: z
    .array(
      z.object({
        resourceSlug: z.string(),
        note: z.string().default('')
      })
    )
    .min(1)
});
