import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { config } from '../config.js';
import { all, get, insert, run } from '../db/sql.js';
import { nowIso, parseJsonObject } from '../lib/domain.js';
import { createUser } from '../modules/auth/auth.repo.js';
import {
  collectionFileSchema,
  competitionFileSchema,
  courseFileSchema,
  curriculumFileSchema,
  exerciseFileSchema,
  milestoneFileSchema,
  pathFileSchema,
  resourceFileSchema,
} from './schemas.js';

export type SeedSummary = { lines: string[] };

class SeedError extends Error {}

function readJsonDir<T>(dir: string, schema: z.ZodType<T>, label: string): T[] {
  if (!fs.existsSync(dir)) {
    throw new SeedError(`${label} directory is missing: ${dir}\n  Run "npm run curriculum:build" (or add content files) first.`);
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  if (files.length === 0) throw new SeedError(`No ${label} files found in ${dir}`);
  const out: T[] = [];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(dir, file), 'utf8');
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch (err) {
      throw new SeedError(`${file} is not valid JSON: ${(err as Error).message}`);
    }
    const entries = Array.isArray(parsedJson) ? parsedJson : [parsedJson];
    entries.forEach((entry, index) => {
      const result = schema.safeParse(entry);
      if (!result.success) {
        const issues = result.error.issues
          .slice(0, 12)
          .map((i) => `    - ${i.path.join('.')}: ${i.message}`)
          .join('\n');
        throw new SeedError(`${file}[${index}] failed ${label} validation:\n${issues}`);
      }
      out.push(result.data);
    });
  }
  return out;
}

function topicIdOf(map: Map<string, number>, slug: string, context: string): number {
  const id = map.get(slug);
  if (id === undefined) throw new SeedError(`Unknown topic slug "${slug}" referenced by ${context}`);
  return id;
}

function upsertDomain(db: Database.Database, input: { slug: string; name: string; summary: string; order: number }): number {
  const timestamp = nowIso();
  run(
    db,
    `INSERT INTO domains (slug, name, summary, order_index, created_at, updated_at)
     VALUES (@slug, @name, @summary, @order, @timestamp, @timestamp)
     ON CONFLICT (slug) DO UPDATE SET name = @name, summary = @summary, order_index = @order, updated_at = @timestamp`,
    { slug: input.slug, name: input.name, summary: input.summary, order: input.order, timestamp }
  );
  return Number(get<{ id: number }>(db, 'SELECT id FROM domains WHERE slug = ?', { slug: input.slug })?.id);
}

function upsertSubdomain(db: Database.Database, domainId: number, input: { slug: string; name: string; summary: string; order: number }): number {
  const timestamp = nowIso();
  run(
    db,
    `INSERT INTO subdomains (domain_id, slug, name, summary, order_index, created_at, updated_at)
     VALUES (@domainId, @slug, @name, @summary, @order, @timestamp, @timestamp)
     ON CONFLICT (slug) DO UPDATE SET
       domain_id = @domainId, name = @name, summary = @summary, order_index = @order, updated_at = @timestamp`,
    { domainId, slug: input.slug, name: input.name, summary: input.summary, order: input.order, timestamp }
  );
  return Number(get<{ id: number }>(db, 'SELECT id FROM subdomains WHERE slug = ?', { slug: input.slug })?.id);
}

function ensureTag(db: Database.Database, name: string): number {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug) return 0;
  run(db, 'INSERT INTO tags (slug, name) VALUES (@slug, @name) ON CONFLICT (slug) DO NOTHING', {
    slug,
    name: name.trim()
  });
  return Number(get<{ id: number }>(db, 'SELECT id FROM tags WHERE slug = ?', { slug })?.id ?? 0);
}

function seedCurriculum(db: Database.Database, lines: string[]): Map<string, number> {
  const files = readJsonDir(config.curriculumDir, curriculumFileSchema, 'curriculum');
  const topicIds = new Map<string, number>();
  let topicCount = 0;
  let readingCount = 0;

  for (const file of files) {
    for (const domain of file.domains) {
      const domainId = upsertDomain(db, { slug: domain.slug, name: domain.name, summary: domain.summary, order: domain.order });
      for (const subdomain of domain.subdomains) {
        const subdomainId = upsertSubdomain(db, domainId, {
          slug: subdomain.slug,
          name: subdomain.name,
          summary: subdomain.summary,
          order: subdomain.order
        });
        for (const topic of subdomain.topics) {
          const timestamp = nowIso();
          run(
            db,
            `INSERT INTO topics (subdomain_id, slug, name, difficulty, definition, explanation, learning_objectives,
              key_results, math_foundations, applications, misconceptions, open_problems, history_note, est_minutes,
              tags, status, created_at, updated_at)
             VALUES (@subdomainId, @slug, @name, @difficulty, @definition, @explanation, @objectives, @keyResults,
              @math, @applications, @misconceptions, @openProblems, @historyNote, @estMinutes, @tags, 'published',
              @timestamp, @timestamp)
             ON CONFLICT (slug) DO UPDATE SET
               subdomain_id = @subdomainId, name = @name, difficulty = @difficulty, definition = @definition,
               explanation = @explanation, learning_objectives = @objectives, key_results = @keyResults,
               math_foundations = @math, applications = @applications, misconceptions = @misconceptions,
               open_problems = @openProblems, history_note = @historyNote, est_minutes = @estMinutes,
               tags = @tags, updated_at = @timestamp`,
            {
              subdomainId,
              slug: topic.slug,
              name: topic.name,
              difficulty: topic.difficulty,
              definition: topic.definition,
              explanation: topic.explanation,
              objectives: JSON.stringify(topic.learningObjectives),
              keyResults: JSON.stringify(topic.keyResults),
              math: JSON.stringify(topic.mathFoundations),
              applications: JSON.stringify(topic.applications),
              misconceptions: JSON.stringify(topic.misconceptions),
              openProblems: topic.openProblems,
              historyNote: topic.historyNote,
              estMinutes: topic.estMinutes,
              tags: JSON.stringify(topic.tags),
              timestamp
            }
          );
          const id = Number(get<{ id: number }>(db, 'SELECT id FROM topics WHERE slug = ?', { slug: topic.slug })?.id);
          topicIds.set(topic.slug, id);
          topicCount += 1;

          for (const tag of topic.tags) {
            const tagId = ensureTag(db, tag);
            if (tagId) run(db, 'INSERT INTO topic_tags (topic_id, tag_id) VALUES (@t, @g) ON CONFLICT DO NOTHING', { t: id, g: tagId });
          }

          run(db, 'DELETE FROM topic_further_reading WHERE topic_id = @id', { id });
          topic.furtherReading.forEach((entry, position) => {
            insert(db, 'INSERT INTO topic_further_reading (topic_id, position, title, authors, year, type, url, note) VALUES (@topicId, @position, @title, @authors, @year, @type, @url, @note)', {
              topicId: id,
              position,
              title: entry.title,
              authors: entry.authors,
              year: entry.year,
              type: normaliseReadingType(entry.type),
              url: entry.url,
              note: entry.note
            });
            readingCount += 1;
          });
        }
      }
    }
  }

  // Phase 2: relations, now that every slug has an id.
  run(db, 'DELETE FROM topic_relations');
  let relationCount = 0;
  for (const file of files) {
    for (const domain of file.domains) {
      for (const subdomain of domain.subdomains) {
        for (const topic of subdomain.topics) {
          const targetId = topicIdOf(topicIds, topic.slug, `topic ${topic.slug}`);
          const seen = new Set<string>();
          const groups: { kind: 'strict' | 'recommended' | 'related' | 'extension'; slugs: string[] }[] = [
            { kind: 'strict', slugs: topic.prerequisitesStrict },
            { kind: 'recommended', slugs: topic.prerequisitesRecommended },
            { kind: 'related', slugs: topic.relatedConcepts },
            { kind: 'extension', slugs: topic.advancedExtensions }
          ];
          for (const group of groups) {
            for (const other of group.slugs) {
              if (other === topic.slug) continue;
              const key = `${group.kind}:${other}`;
              if (seen.has(key)) continue;
              seen.add(key);
              const otherId = topicIds.get(other);
              if (otherId === undefined) continue; // resolved against the whole corpus below
              insert(
                db,
                `INSERT INTO topic_relations (topic_id, requires_id, kind) VALUES (@topicId, @otherId, @kind)
                 ON CONFLICT (topic_id, requires_id, kind) DO NOTHING`,
                { topicId: targetId, otherId, kind: group.kind }
              );
              relationCount += 1;
            }
          }
        }
      }
    }
  }

  const unresolved = countUnresolvedReferences(files, topicIds);
  lines.push(`curriculum: ${topicCount} topics, ${relationCount} relations, ${readingCount} reading entries from ${files.length} file(s)`);
  if (unresolved.length > 0) {
    lines.push(`unresolved prerequisite slugs (${unresolved.length}): ${unresolved.slice(0, 12).join(', ')}${unresolved.length > 12 ? ' …' : ''}`);
  }
  return topicIds;
}

function countUnresolvedReferences(files: z.infer<typeof curriculumFileSchema>[], topicIds: Map<string, number>): string[] {
  const missing = new Set<string>();
  for (const file of files) {
    for (const domain of file.domains) {
      for (const subdomain of domain.subdomains) {
        for (const topic of subdomain.topics) {
          for (const ref of [
            ...topic.prerequisitesStrict,
            ...topic.prerequisitesRecommended,
            ...topic.relatedConcepts,
            ...topic.advancedExtensions
          ]) {
            if (!topicIds.has(ref)) missing.add(ref);
          }
        }
      }
    }
  }
  return [...missing];
}

function normaliseReadingType(type: string): string {
  const allowed = ['book', 'paper', 'survey', 'lecture-notes', 'course', 'docs', 'blog', 'repository', 'video'];
  return allowed.includes(type) ? type : 'paper';
}

function upsertResource(db: Database.Database, item: z.infer<typeof resourceFileSchema>): number {
  const timestamp = nowIso();
  run(
    db,
    `INSERT INTO resources (slug, title, description, type, url, authors, publisher, published_year, source_name,
        difficulty, est_minutes, is_curated, verified, status, created_at, updated_at)
     VALUES (@slug, @title, @description, @type, @url, @authors, @publisher, @year, @source, @difficulty, @est,
        1, @verified, 'published', @timestamp, @timestamp)
     ON CONFLICT (slug) DO UPDATE SET
        title = @title, description = @description, type = @type, url = @url, authors = @authors,
        publisher = @publisher, published_year = @year, source_name = @source, difficulty = @difficulty,
        est_minutes = @est, verified = @verified, updated_at = @timestamp`,
    {
      slug: item.slug,
      title: item.title,
      description: item.description,
      type: item.type,
      url: item.url,
      authors: item.authors,
      publisher: item.publisher,
      year: item.publishedYear ?? null,
      source: item.sourceName,
      difficulty: item.difficulty,
      est: item.estMinutes ?? null,
      verified: item.verified ? 1 : 0,
      timestamp
    }
  );
  const id = Number(get<{ id: number }>(db, 'SELECT id FROM resources WHERE slug = ?', { slug: item.slug })?.id);
  run(db, 'DELETE FROM resource_topics WHERE resource_id = @id', { id });
  for (const topicSlug of item.topicSlugs) {
    const topicId = resourceTopicId(db, topicSlug);
    if (topicId) run(db, 'INSERT INTO resource_topics (resource_id, topic_id) VALUES (@r, @t) ON CONFLICT DO NOTHING', { r: id, t: topicId });
  }
  run(db, 'DELETE FROM resource_tags WHERE resource_id = @id', { id });
  for (const tag of item.tags) {
    const tagId = ensureTag(db, tag);
    if (tagId) run(db, 'INSERT INTO resource_tags (resource_id, tag_id) VALUES (@r, @g) ON CONFLICT DO NOTHING', { r: id, g: tagId });
  }
  return id;
}

const resourceTopicCache = new Map<string, number | null>();

function normaliseUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, '');
}

/** Attribution taken from the link itself: an arXiv id is in the path, anything else reports its host. */
function sourceFromUrl(url: string): string {
  const arxiv = /arxiv\.org\/abs\/([\w.]+)/i.exec(url);
  if (arxiv) return `arXiv:${arxiv[1]}`;
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Curated resources are seeded first, so a course list can point at the row that already exists. */
function buildResourceUrlIndex(db: Database.Database): Map<string, number> {
  const index = new Map<string, number>();
  for (const row of all<{ id: number; url: string }>(db, 'SELECT id, url FROM resources')) {
    const key = normaliseUrl(row.url);
    if (key) index.set(key, row.id);
  }
  return index;
}

/** Additive on purpose: reusing a curated row must not rewrite the topics it was published against. */
function attachResourceToTopics(db: Database.Database, resourceId: number, topicSlugs: string[]): void {
  for (const topicSlug of topicSlugs) {
    const topicId = resourceTopicId(db, topicSlug);
    if (topicId) {
      run(db, 'INSERT INTO resource_topics (resource_id, topic_id) VALUES (@r, @t) ON CONFLICT DO NOTHING', {
        r: resourceId,
        t: topicId
      });
    }
  }
}

function resourceTopicId(db: Database.Database, slug: string): number | null {
  if (resourceTopicCache.has(slug)) return resourceTopicCache.get(slug) ?? null;
  const row = get<{ id: number }>(db, 'SELECT id FROM topics WHERE slug = ?', { slug });
  const id = row ? row.id : null;
  resourceTopicCache.set(slug, id);
  return id;
}

function seedCourses(db: Database.Database, lines: string[], stats: { exercises: number }): void {
  const files = readJsonDir(path.join(config.dataDir, 'content', 'courses'), courseFileSchema, 'course');
  const urlIndex = buildResourceUrlIndex(db);
  let lessonCount = 0;
  let blockCount = 0;
  for (const course of files) {
    const timestamp = nowIso();
    run(
      db,
      `INSERT INTO courses (slug, title, subtitle, summary, difficulty, status, est_hours, author, audience,
          objectives, prerequisites_note, completion_criteria, is_featured, order_index, created_at, updated_at)
       VALUES (@slug, @title, @subtitle, @summary, @difficulty, 'published', @estHours, @author, @audience,
          @objectives, @prerequisites, @completion, @featured, @order, @timestamp, @timestamp)
       ON CONFLICT (slug) DO UPDATE SET
          title = @title, subtitle = @subtitle, summary = @summary, difficulty = @difficulty, status = 'published',
          est_hours = @estHours, author = @author, audience = @audience, objectives = @objectives,
          prerequisites_note = @prerequisites, completion_criteria = @completion, is_featured = @featured,
          order_index = @order, updated_at = @timestamp`,
      {
        slug: course.slug,
        title: course.title,
        subtitle: course.subtitle,
        summary: course.summary,
        difficulty: course.difficulty,
        estHours: course.estHours,
        author: course.author,
        audience: course.audience,
        objectives: JSON.stringify(course.objectives),
        prerequisites: course.prerequisitesNote,
        completion: course.completionCriteria,
        featured: course.isFeatured ? 1 : 0,
        order: 0,
        timestamp
      }
    );
    const courseId = Number(get<{ id: number }>(db, 'SELECT id FROM courses WHERE slug = ?', { slug: course.slug })?.id);
    run(db, 'DELETE FROM course_topics WHERE course_id = @id', { id: courseId });
    for (const topicSlug of course.topicSlugs) {
      const topicId = resourceTopicId(db, topicSlug);
      if (topicId) run(db, 'INSERT INTO course_topics (course_id, topic_id) VALUES (@c, @t) ON CONFLICT DO NOTHING', { c: courseId, t: topicId });
    }
    run(db, 'DELETE FROM lesson_topics WHERE lesson_id IN (SELECT id FROM lessons WHERE course_id = @id)', { id: courseId });
    run(db, 'DELETE FROM course_modules WHERE course_id = @id', { id: courseId });

    let lessonIndex = 0;
    for (const [modulePosition, module] of course.modules.entries()) {
      const moduleId = insert(db, 'INSERT INTO course_modules (course_id, title, summary, order_index) VALUES (@c, @title, @summary, @position)', {
        c: courseId,
        title: module.title,
        summary: module.summary,
        position: modulePosition
      });
      for (const lesson of module.lessons) {
        lessonIndex += 1;
        const lessonTimestamp = nowIso();
        run(
          db,
          `INSERT INTO lessons (course_id, module_id, slug, title, summary, order_index, status, est_minutes, created_at, updated_at)
           VALUES (@courseId, @moduleId, @slug, @title, @summary, @order, 'published', @est, @timestamp, @timestamp)
           ON CONFLICT (slug) DO UPDATE SET
             course_id = @courseId, module_id = @moduleId, title = @title, summary = @summary,
             order_index = @order, status = 'published', est_minutes = @est, updated_at = @timestamp`,
          {
            courseId,
            moduleId,
            slug: lesson.slug,
            title: lesson.title,
            summary: lesson.summary,
            order: lessonIndex,
            est: lesson.estMinutes,
            timestamp: lessonTimestamp
          }
        );
        const lessonId = Number(get<{ id: number }>(db, 'SELECT id FROM lessons WHERE slug = ?', { slug: lesson.slug })?.id);
        run(db, 'DELETE FROM lesson_topics WHERE lesson_id = @id', { id: lessonId });
        for (const topicSlug of lesson.topicSlugs) {
          const topicId = resourceTopicId(db, topicSlug);
          if (!topicId) throw new SeedError(`Lesson "${lesson.slug}" references unknown topic "${topicSlug}"`);
          run(db, 'INSERT INTO lesson_topics (lesson_id, topic_id) VALUES (@l, @t) ON CONFLICT DO NOTHING', { l: lessonId, t: topicId });
          run(db, 'INSERT INTO course_topics (course_id, topic_id) VALUES (@c, @t) ON CONFLICT DO NOTHING', { c: courseId, t: topicId });
        }
        run(db, 'DELETE FROM lesson_blocks WHERE lesson_id = @id', { id: lessonId });
        lesson.blocks.forEach((block, position) => {
          insert(db, 'INSERT INTO lesson_blocks (lesson_id, order_index, type, text, payload, created_at, updated_at) VALUES (@l, @position, @type, @text, @payload, @now, @now)', {
            l: lessonId,
            position,
            type: block.type,
            text: block.text,
            payload: JSON.stringify(block.payload ?? {}),
            now: nowIso()
          });
          blockCount += 1;
          if (block.type === 'exercise') stats.exercises += 1;
        });
        run(db, 'DELETE FROM lesson_references WHERE lesson_id = @id', { id: lessonId });
        lesson.references.forEach((reference, position) => {
          insert(db, 'INSERT INTO lesson_references (lesson_id, position, title, authors, year, type, url, note) VALUES (@l, @position, @title, @authors, @year, @type, @url, @note)', {
            l: lessonId,
            position,
            title: reference.title,
            authors: reference.authors,
            year: reference.year ?? null,
            type: reference.type,
            url: reference.url ?? null,
            note: reference.note ?? null
          });
        });
        // A citation a lesson relies on belongs in the library as well, so the research view shows
        // what the curriculum actually points at instead of a separate hand-maintained feed.
        for (const reference of lesson.references) {
          if (!reference.url) {
            throw new SeedError(`Lesson "${lesson.slug}" cites "${reference.title}" without a url`);
          }
          const key = normaliseUrl(reference.url);
          const existing = urlIndex.get(key);
          if (existing) {
            attachResourceToTopics(db, existing, lesson.topicSlugs);
            continue;
          }
          const created = upsertResource(db, {
            slug: `citation-${lesson.slug}-${slugify(reference.title)}`,
            title: reference.title,
            description: reference.note ?? '',
            type: reference.type,
            url: reference.url,
            authors: reference.authors,
            publisher: '',
            publishedYear: reference.year,
            sourceName: sourceFromUrl(reference.url),
            difficulty: course.difficulty,
            topicSlugs: lesson.topicSlugs,
            tags: [],
            verified: reference.verified
          });
          urlIndex.set(key, created);
        }
        lessonCount += 1;
      }
    }
    for (const reference of course.resources) {
      if (!reference.url) {
        throw new SeedError(`Course "${course.slug}" lists "${reference.title}" without a url; a resource link is never invented`);
      }
      const key = normaliseUrl(reference.url);
      const existing = urlIndex.get(key);
      if (existing) {
        attachResourceToTopics(db, existing, course.topicSlugs);
        urlIndex.set(key, existing);
        continue;
      }
      const created = upsertResource(db, {
        slug: `course-${course.slug}-${slugify(reference.title)}`,
        title: reference.title,
        description: reference.note ?? '',
        type: reference.type,
        url: reference.url,
        authors: reference.authors,
        publisher: '',
        publishedYear: reference.year,
        sourceName: sourceFromUrl(reference.url),
        difficulty: course.difficulty,
        topicSlugs: course.topicSlugs,
        tags: [],
        verified: reference.verified
      });
      urlIndex.set(key, created);
    }
  }
  lines.push(`courses: ${files.length}, lessons: ${lessonCount}, content blocks: ${blockCount}`);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function seedExercises(db: Database.Database, lines: string[]): void {
  const files = readJsonDir(path.join(config.dataDir, 'content', 'exercises'), exerciseFileSchema, 'exercise');
  for (const item of files) {
    const timestamp = nowIso();
    const topicId = resourceTopicId(db, item.topicSlugs[0] ?? '') ?? null;
    const lessonId = item.lessonSlug
      ? get<{ id: number }>(db, 'SELECT id FROM lessons WHERE slug = ?', { slug: item.lessonSlug })?.id ?? null
      : null;
    run(
      db,
      `INSERT INTO exercises (slug, kind, topic_id, lesson_id, difficulty, points, title, prompt, context,
          answer_spec, solution, explanation, answer_note, status, created_at, updated_at)
       VALUES (@slug, @kind, @topic, @lesson, @difficulty, @points, @title, @prompt, @context, @spec, @solution,
          @explanation, @answerNote, 'published', @timestamp, @timestamp)
       ON CONFLICT (slug) DO UPDATE SET
          kind = @kind, topic_id = @topic, lesson_id = @lesson, difficulty = @difficulty, points = @points,
          title = @title, prompt = @prompt, context = @context, answer_spec = @spec, solution = @solution,
          explanation = @explanation, answer_note = @answerNote, updated_at = @timestamp`,
      {
        slug: item.slug,
        kind: item.kind,
        topic: topicId,
        lesson: lessonId,
        difficulty: item.difficulty,
        points: item.points,
        title: item.title,
        prompt: item.prompt,
        context: item.context,
        spec: JSON.stringify(item.payload),
        solution: item.solution,
        explanation: item.explanation,
        answerNote: item.answerNote,
        timestamp
      }
    );
    const exerciseId = Number(get<{ id: number }>(db, 'SELECT id FROM exercises WHERE slug = ?', { slug: item.slug })?.id);
    run(db, 'DELETE FROM exercise_options WHERE exercise_id = @id', { id: exerciseId });
    const options = parseJsonObject(item.payload, z.object({ options: z.array(z.object({ label: z.string(), text: z.string(), correct: z.boolean(), feedback: z.string().optional() })).optional() }));
    (options?.options ?? []).forEach((option, position) => {
      insert(db, 'INSERT INTO exercise_options (exercise_id, label, text, is_correct, position, feedback) VALUES (@e, @label, @text, @correct, @position, @feedback)', {
        e: exerciseId,
        label: option.label,
        text: option.text,
        correct: option.correct ? 1 : 0,
        position,
        feedback: option.feedback ?? null
      });
    });
    run(db, 'DELETE FROM exercise_hints WHERE exercise_id = @id', { id: exerciseId });
    item.hints.forEach((hint, position) => {
      insert(db, 'INSERT INTO exercise_hints (exercise_id, position, text) VALUES (@e, @position, @text)', { e: exerciseId, position, text: hint });
    });
    run(db, 'DELETE FROM exercise_topics WHERE exercise_id = @id', { id: exerciseId });
    for (const slug of item.topicSlugs) {
      const id = resourceTopicId(db, slug);
      if (id) run(db, 'INSERT INTO exercise_topics (exercise_id, topic_id) VALUES (@e, @t) ON CONFLICT DO NOTHING', { e: exerciseId, t: id });
    }
    run(db, 'DELETE FROM exercise_tags WHERE exercise_id = @id', { id: exerciseId });
    for (const tag of item.tags) {
      const tagId = ensureTag(db, tag);
      if (tagId) run(db, 'INSERT INTO exercise_tags (exercise_id, tag_id) VALUES (@e, @g) ON CONFLICT DO NOTHING', { e: exerciseId, g: tagId });
    }
  }
  lines.push(`exercises: ${files.length}`);
}

function seedPaths(db: Database.Database, lines: string[]): void {
  const files = readJsonDir(path.join(config.dataDir, 'content', 'paths'), pathFileSchema, 'learning path');
  files.forEach((item, fileOrder) => {
    const timestamp = nowIso();
    run(
      db,
      `INSERT INTO learning_paths (slug, name, summary, description, audience, difficulty, est_hours, objectives,
          completion_criteria, prerequisites_note, outcome_note, status, is_featured, order_index, created_at, updated_at)
       VALUES (@slug, @name, @summary, @description, @audience, @difficulty, @estHours, @objectives, @completion,
          @prerequisites, @outcome, 'published', @featured, @order, @timestamp, @timestamp)
       ON CONFLICT (slug) DO UPDATE SET
          name = @name, summary = @summary, description = @description, audience = @audience, difficulty = @difficulty,
          est_hours = @estHours, objectives = @objectives, completion_criteria = @completion,
          prerequisites_note = @prerequisites, outcome_note = @outcome, status = 'published', is_featured = @featured,
          order_index = @order, updated_at = @timestamp`,
      {
        slug: item.slug,
        name: item.name,
        summary: item.summary,
        description: item.description,
        audience: item.audience,
        difficulty: item.difficulty,
        estHours: item.estHours,
        objectives: JSON.stringify(item.objectives),
        completion: item.completionCriteria,
        prerequisites: item.prerequisitesNote,
        outcome: item.outcomeNote,
        featured: item.isFeatured ? 1 : 0,
        order: fileOrder,
        timestamp
      }
    );
    const pathId = Number(get<{ id: number }>(db, 'SELECT id FROM learning_paths WHERE slug = ?', { slug: item.slug })?.id);
    run(db, 'DELETE FROM learning_path_topics WHERE path_id = @id', { id: pathId });
    run(db, 'DELETE FROM learning_path_courses WHERE path_id = @id', { id: pathId });
    run(db, 'DELETE FROM learning_path_stages WHERE path_id = @id', { id: pathId });
    let position = 0;
    const seenTopics = new Set<string>();
    const seenCourses = new Set<string>();
    item.stages.forEach((stage, stageOrder) => {
      const stageId = insert(db, 'INSERT INTO learning_path_stages (path_id, title, summary, order_index) VALUES (@p, @title, @summary, @order)', {
        p: pathId,
        title: stage.title,
        summary: stage.summary,
        order: stageOrder
      });
      for (const slug of [...stage.topicSlugs, ...stage.optionalTopicSlugs]) {
        if (seenTopics.has(slug)) {
          throw new SeedError(
            `Path "${item.slug}" lists topic "${slug}" in more than one stage. A topic belongs to a path once; keep it in the stage where it is first needed.`
          );
        }
        seenTopics.add(slug);
      }
      for (const slug of stage.courseSlugs) {
        if (seenCourses.has(slug)) {
          throw new SeedError(
            `Path "${item.slug}" lists course "${slug}" in more than one stage. Reference the course once, in the stage that starts it.`
          );
        }
        seenCourses.add(slug);
      }
      for (const slug of stage.topicSlugs) {
        position += 1;
        const topicId = topicIdOf(topicIdsForPaths, slug, `path ${item.slug}`);
        insert(db, 'INSERT INTO learning_path_topics (path_id, topic_id, stage_id, order_index, is_optional) VALUES (@p, @t, @s, @order, 0)', {
          p: pathId,
          t: topicId,
          s: stageId,
          order: position
        });
      }
      for (const slug of stage.optionalTopicSlugs) {
        position += 1;
        const topicId = topicIdsForPaths.get(slug);
        if (!topicId) continue;
        insert(db, 'INSERT INTO learning_path_topics (path_id, topic_id, stage_id, order_index, is_optional) VALUES (@p, @t, @s, @order, 1)', {
          p: pathId,
          t: topicId,
          s: stageId,
          order: position
        });
      }
      for (const slug of stage.courseSlugs) {
        position += 1;
        const course = get<{ id: number }>(db, 'SELECT id FROM courses WHERE slug = ?', { slug });
        if (!course) throw new SeedError(`Path "${item.slug}" references unknown course "${slug}"`);
        insert(db, 'INSERT INTO learning_path_courses (path_id, course_id, stage_id, order_index, is_optional) VALUES (@p, @c, @s, @order, 0)', {
          p: pathId,
          c: course.id,
          s: stageId,
          order: position
        });
      }
    });
  });
  lines.push(`learning paths: ${files.length}`);
}

function seedEvents(db: Database.Database, lines: string[]): void {
  const competitionDir = path.join(config.dataDir, 'content', 'competitions.json');
  if (fs.existsSync(competitionDir)) {
    const parsed = competitionFileSchema.array().safeParse(JSON.parse(fs.readFileSync(competitionDir, 'utf8')));
    if (!parsed.success) throw new SeedError(`competitions.json invalid: ${z.prettifyError(parsed.error)}`);
    for (const item of parsed.data) {
      const timestamp = nowIso();
      run(
        db,
        `INSERT INTO competitions (slug, name, organizer, type, url, summary, requirements, skills_practiced,
            difficulty, start_date, deadline_date, location, status, is_live_data, source_updated_at, created_at, updated_at)
         VALUES (@slug, @name, @organizer, @type, @url, @summary, @requirements, @skills, @difficulty, @start,
            @deadline, @location, @status, 0, @sourceUpdated, @timestamp, @timestamp)
         ON CONFLICT (slug) DO UPDATE SET
            name = @name, organizer = @organizer, type = @type, url = @url, summary = @summary,
            requirements = @requirements, skills_practiced = @skills, difficulty = @difficulty,
            start_date = @start, deadline_date = @deadline, location = @location, status = @status,
            source_updated_at = @sourceUpdated, updated_at = @timestamp`,
        {
          slug: item.slug,
          name: item.name,
          organizer: item.organizer,
          type: item.type,
          url: item.url,
          summary: item.summary,
          requirements: item.requirements,
          skills: item.skillsPracticed,
          difficulty: item.difficulty,
          start: item.startDate ?? null,
          deadline: item.deadlineDate ?? null,
          location: item.location,
          status: item.status,
          sourceUpdated: item.sourceUpdatedAt,
          timestamp
        }
      );
      const competitionId = Number(get<{ id: number }>(db, 'SELECT id FROM competitions WHERE slug = ?', { slug: item.slug })?.id);
      run(db, 'DELETE FROM competition_topics WHERE competition_id = @id', { id: competitionId });
      for (const slug of item.topicSlugs) {
        const topicId = resourceTopicId(db, slug);
        if (topicId) run(db, 'INSERT INTO competition_topics (competition_id, topic_id) VALUES (@c, @t) ON CONFLICT DO NOTHING', { c: competitionId, t: topicId });
      }
    }
    lines.push(`competitions/events: ${parsed.data.length}`);
  }

  const milestonePath = path.join(config.dataDir, 'content', 'milestones.json');
  if (fs.existsSync(milestonePath)) {
    const parsed = milestoneFileSchema.array().safeParse(JSON.parse(fs.readFileSync(milestonePath, 'utf8')));
    if (!parsed.success) throw new SeedError(`milestones.json invalid: ${z.prettifyError(parsed.error)}`);
    for (const item of parsed.data) {
      const existing = get<{ id: number }>(db, 'SELECT id FROM milestones WHERE occurred_on = @day AND title = @title', {
        day: item.occurredOn,
        title: item.title
      });
      if (existing) continue;
      insert(db, 'INSERT INTO milestones (occurred_on, title, summary, kind, url, source_name, topic_id, created_at) VALUES (@day, @title, @summary, @kind, @url, @source, @topic, @now)', {
        day: item.occurredOn,
        title: item.title,
        summary: item.summary,
        kind: item.kind,
        url: item.url ?? null,
        source: item.sourceName,
        topic: item.topicSlug ? resourceTopicId(db, item.topicSlug) : null,
        now: nowIso()
      });
    }
    lines.push(`milestones: ${parsed.data.length}`);
  }
}

function seedCollections(db: Database.Database, lines: string[]): void {
  const file = path.join(config.dataDir, 'content', 'collections.json');
  if (!fs.existsSync(file)) return;
  const parsed = collectionFileSchema.array().safeParse(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (!parsed.success) throw new SeedError(`collections.json invalid: ${z.prettifyError(parsed.error)}`);
  parsed.data.forEach((collection, order) => {
    const timestamp = nowIso();
    run(
      db,
      `INSERT INTO curated_collections (slug, title, description, kind, order_index, created_at, updated_at)
       VALUES (@slug, @title, @description, @kind, @order, @timestamp, @timestamp)
       ON CONFLICT (slug) DO UPDATE SET title = @title, description = @description, kind = @kind, order_index = @order, updated_at = @timestamp`,
      { slug: collection.slug, title: collection.title, description: collection.description, kind: collection.kind, order, timestamp }
    );
    const collectionId = Number(get<{ id: number }>(db, 'SELECT id FROM curated_collections WHERE slug = ?', { slug: collection.slug })?.id);
    run(db, 'DELETE FROM curated_collection_items WHERE collection_id = @id', { id: collectionId });
    collection.items.forEach((item, position) => {
      const resource = get<{ id: number }>(db, 'SELECT id FROM resources WHERE slug = ?', { slug: item.resourceSlug });
      if (!resource) throw new SeedError(`Collection "${collection.slug}" references unknown resource "${item.resourceSlug}"`);
      insert(db, 'INSERT INTO curated_collection_items (collection_id, resource_id, position, note) VALUES (@c, @r, @p, @n)', {
        c: collectionId,
        r: resource.id,
        p: position,
        n: item.note
      });
    });
  });
  lines.push(`curated collections: ${parsed.data.length}`);
}

let topicIdsForPaths: Map<string, number> = new Map();

function seedUsers(db: Database.Database, lines: string[]): void {
  const timestamp = nowIso();
  const existingAdmin = get<{ id: number }>(db, 'SELECT id FROM users WHERE email = ?', { email: config.seedAdmin.email });
  if (!existingAdmin) {
    createUser(db, {
      email: config.seedAdmin.email,
      password: config.seedAdmin.password,
      displayName: 'Platform Administrator',
      role: 'admin'
    });
  }
  run(db, "UPDATE users SET role = 'admin' WHERE email = @email", { email: config.seedAdmin.email });
  const demo = get<{ id: number }>(db, 'SELECT id FROM users WHERE email = ?', { email: 'learner@aimastery.local' });
  if (!demo) {
    createUser(db, { email: 'learner@aimastery.local', password: 'Learn-2026-demo', displayName: 'Sample Learner', role: 'learner' });
  }
  run(db, `INSERT INTO app_settings (key, value, updated_at) VALUES ('curriculum_seeded_at', @value, @timestamp)
           ON CONFLICT (key) DO UPDATE SET value = @value, updated_at = @timestamp`, {
    value: JSON.stringify(timestamp),
    timestamp
  });
  const counts = get<Record<string, number>>(
    db,
    `SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM resources) AS resources`
  );
  lines.push(`users: ${counts?.users ?? 0} (admin: ${config.seedAdmin.email}, demo: learner@aimastery.local)`);
  void config.uploadDir;
}

export async function seedAll(db: Database.Database): Promise<SeedSummary> {
  const lines: string[] = [];
  const stats = { exercises: 0 };
  const seeded = db.transaction(() => {
    topicIdsForPaths = seedCurriculum(db, lines);
    const resourceFiles = readJsonDir(path.join(config.dataDir, 'content', 'resources'), resourceFileSchema, 'resource');
    for (const item of resourceFiles) upsertResource(db, item);
    lines.push(`resources: ${resourceFiles.length}`);
    seedCourses(db, lines, stats);
    seedExercises(db, lines);
    seedPaths(db, lines);
    seedEvents(db, lines);
    seedCollections(db, lines);
    seedUsers(db, lines);
  });
  seeded();
  const totals = all<{ table_name: string; count: number }>(
    db,
    `SELECT 'topics' AS table_name, COUNT(*) AS count FROM topics
     UNION ALL SELECT 'courses', COUNT(*) FROM courses
     UNION ALL SELECT 'lessons', COUNT(*) FROM lessons
     UNION ALL SELECT 'exercises', COUNT(*) FROM exercises
     UNION ALL SELECT 'resources', COUNT(*) FROM resources`
  );
  lines.push(`totals: ${totals.map((t) => `${t.table_name}=${t.count}`).join(', ')}`);
  lines.push(`block-embedded exercise references: ${stats.exercises}`);
  return { lines };
}
