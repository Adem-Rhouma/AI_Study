import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { exerciseFileSchema } from '../src/seed/schemas.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const contentDir = path.join(here, '..', 'data', 'content');

function readJsonDir(dir: string) {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ file, data: JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as unknown }));
}

/**
 * Curated content is product surface: a note that quotes the expected value, or a lesson that points
 * at an exercise nobody wrote, reaches learners the moment the seed runs.
 */
describe('curated exercise content', () => {
  const files = readJsonDir(path.join(contentDir, 'exercises'));
  const exercises = files.flatMap(({ file, data }) =>
    (Array.isArray(data) ? data : []).map((item) => ({ file, item: item as Record<string, unknown> }))
  );

  it('ships at least one exercise file', () => {
    expect(exercises.length).toBeGreaterThan(0);
  });

  it('parses every exercise against the seed schema, answer notes included', () => {
    for (const { file, item } of exercises) {
      const result = exerciseFileSchema.safeParse(item);
      expect(result.success, `${file}: ${String(item.slug)} — ${JSON.stringify(result.error?.issues)}`).toBe(true);
    }
  });

  it('never states a true/false answer in the note shown before submission', () => {
    for (const { item } of exercises) {
      if (item.kind !== 'true_false') continue;
      expect(String(item.answerNote ?? '').toLowerCase()).not.toMatch(/\b(true|false)\b\s*[.,!?]?\s*$/);
    }
  });

  it('gives every true/false exercise the answer the grader needs', () => {
    for (const { item } of exercises) {
      if (item.kind !== 'true_false') continue;
      const payload = item.payload as Record<string, unknown> | undefined;
      expect(payload?.expected, `${String(item.slug)} has no expected answer, so submitting grades into a review error`).toBeTypeOf('boolean');
    }
  });

  it('resolves every exercise a lesson block references', () => {
    const slugs = new Set(exercises.map(({ item }) => String(item.slug)));
    const referenced: { lesson: string; slug: string }[] = [];
    for (const { data } of readJsonDir(path.join(contentDir, 'courses'))) {
      const course = data as { modules?: { lessons?: Record<string, unknown>[] }[] };
      for (const lesson of course.modules?.flatMap((module) => module.lessons ?? []) ?? []) {
        const blocks = Array.isArray(lesson.blocks) ? (lesson.blocks as Record<string, unknown>[]) : [];
        for (const block of blocks) {
          if (block.type !== 'exercise') continue;
          const payload = (block.payload ?? {}) as Record<string, unknown>;
          const slug = payload.exerciseSlug ?? payload.slug;
          if (typeof slug === 'string') referenced.push({ lesson: String(lesson.slug), slug });
        }
      }
    }
    expect(referenced.length).toBeGreaterThan(0);
    for (const entry of referenced) {
      expect(slugs.has(entry.slug), `lesson ${entry.lesson} references unknown exercise ${entry.slug}`).toBe(true);
    }
  });
});
