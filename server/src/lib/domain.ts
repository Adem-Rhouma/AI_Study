import { z } from 'zod';

export const DIFFICULTIES = [
  'introductory',
  'beginner',
  'intermediate',
  'advanced',
  'expert'
] as const;

export const difficultySchema = z.enum(DIFFICULTIES);
export type Difficulty = (typeof DIFFICULTIES)[number];

export const difficultyRank: Record<Difficulty, number> = {
  introductory: 0,
  beginner: 1,
  intermediate: 2,
  advanced: 3,
  expert: 4
};

export const slugSchema = z
  .string()
  .min(2)
  .max(96)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase words separated by single hyphens');

export const idParam = z.coerce.number().int().positive();

/**
 * A query string has no booleans: `?featured=false` arrives as the four-character string and
 * `z.coerce.boolean()` reads it as true, because Boolean('false') is true. Only an affirmative
 * spelling switches a filter on; anything else, including an absent parameter, is false.
 */
export const queryBoolean = z.preprocess(
  (value) => (typeof value === 'string' ? ['true', '1', 'yes'].includes(value.trim().toLowerCase()) : value),
  z.boolean().default(false)
);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(2000).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(24)
});

export const searchQuerySchema = z.object({
  q: z.string().trim().max(200).default(''),
  page: z.coerce.number().int().min(1).max(2000).default(1),
  perPage: z.coerce.number().int().min(1).max(60).default(20)
});

export const optionalDifficulty = z.union([difficultySchema, z.literal('all')]).default('all');

export const resourceTypes = [
  'paper',
  'book',
  'survey',
  'course',
  'video',
  'docs',
  'repository',
  'tutorial',
  'dataset',
  'tool',
  'lecture-notes',
  'blog',
  'standard'
] as const;
export const resourceTypeSchema = z.enum(resourceTypes);

export const exerciseKinds = [
  'single_choice',
  'multi_choice',
  'true_false',
  'numeric',
  'short_answer',
  'expression',
  'derivation',
  'code',
  'match'
] as const;
export const exerciseKindSchema = z.enum(exerciseKinds);

export const blockTypes = [
  'heading',
  'prose',
  'list',
  'callout',
  'math',
  'derivation',
  'worked_example',
  'definition',
  'theorem',
  'code',
  'exercise',
  'quiz',
  'image',
  'table',
  'quote',
  'interactive',
  'comparison',
  'timeline',
  'reference',
  'checklist',
  'tabs'
] as const;
export const blockTypeSchema = z.enum(blockTypes);

export function parseJsonArray<T>(raw: unknown, item: z.ZodType<T>): T[] {
  const value = typeof raw === 'string' ? safeJson(raw) : raw;
  const result = z.array(item).safeParse(value ?? []);
  return result.success ? result.data : [];
}

export function parseJsonObject<T extends z.ZodTypeAny>(raw: unknown, schema: T): z.infer<T> | null {
  const value = typeof raw === 'string' ? safeJson(raw) : raw;
  if (value === null) return null;
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
