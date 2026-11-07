/**
 * Curriculum build: research corpus -> normalised curriculum files for the seeder.
 *
 * The research files under /research are the raw output of the literature survey. This step is
 * deliberately mechanical: rename keys, clamp enums, and apply the citation-integrity rules.
 * Anything that cannot be verified is dropped here, with a report, rather than shipped as data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIFFICULTIES, type Difficulty } from '../lib/domain.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '../../..');
const researchDir = path.join(projectRoot, 'research');
const outDir = path.join(projectRoot, 'server', 'data', 'curriculum');

type RawReading = {
  title?: unknown;
  authors?: unknown;
  year?: unknown;
  type?: unknown;
  url?: unknown;
  note?: unknown;
};

type RawTopic = {
  slug?: unknown;
  name?: unknown;
  difficulty?: unknown;
  tags?: unknown;
  definition?: unknown;
  explanation?: unknown;
  learning_objectives?: unknown;
  prerequisites_strict?: unknown;
  prerequisites_recommended?: unknown;
  related_concepts?: unknown;
  advanced_extensions?: unknown;
  key_results_or_algorithms?: unknown;
  math_foundations?: unknown;
  applications?: unknown;
  common_misconceptions?: unknown;
  further_reading?: unknown;
  history_note?: unknown;
  open_problems?: unknown;
  est_minutes?: unknown;
};

const report = {
  files: 0,
  domains: 0,
  subdomains: 0,
  topics: 0,
  topicsDropped: [] as string[],
  readingsKept: 0,
  readingsDropped: [] as string[],
  duplicateSlugs: [] as string[]
};

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function strList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => str(item)).filter((item) => item !== '');
}

function nullableStr(value: unknown): string | null {
  const text = str(value);
  return text === '' ? null : text;
}

function difficultyOf(value: unknown): Difficulty | null {
  return (DIFFICULTIES as readonly string[]).includes(str(value)) ? (value as Difficulty) : null;
}

/**
 * A citation is kept only when it names a work and carries either a resolvable URL or an
 * author/year pair. Titles or author strings containing uncertainty markers ("?", "use ",
 * replacement characters) are treated as unverified and dropped — the corpus must not ship
 * half-remembered references.
 */
/**
 * A citation is kept only when it names a work and carries either a resolvable URL or an
 * author/year pair. Author strings containing uncertainty markers ("?", "use:", replacement
 * characters) are treated as unverified and dropped - the corpus must not ship half-remembered
 * references. Titles may legitimately end in "?" (question-titled papers), so only hint
 * patterns are checked there.
 */
function authorLooksUncertain(text: string): boolean {
  return text.includes('?') || text.includes('�') || /- use /i.test(text) || /use:/i.test(text);
}

function titleLooksUncertain(text: string): boolean {
  return text.includes('�') || /- use /i.test(text) || /use:/i.test(text);
}

function cleanReading(raw: RawReading, topicSlug: string): Record<string, unknown> | null {
  const title = str(raw.title);
  const authors = str(raw.authors);
  if (title === '') return null;
  if (titleLooksUncertain(title) || authorLooksUncertain(authors)) {
    report.readingsDropped.push(`${topicSlug}: ${title}`);
    return null;
  }
  const url = str(raw.url);
  const yearRaw = raw.year;
  const year = typeof yearRaw === 'number' && Number.isInteger(yearRaw) && yearRaw > -3000 && yearRaw < 2100 ? yearRaw : null;
  if (url === '' && authors === '') {
    report.readingsDropped.push(`${topicSlug}: ${title} (no url, no authors)`);
    return null;
  }
  if (url !== '' && !/^https?:\/\//i.test(url)) {
    report.readingsDropped.push(`${topicSlug}: ${title} (non-http url)`);
    return null;
  }
  report.readingsKept += 1;
  return {
    title,
    authors: authors === '' ? null : authors,
    year,
    type: str(raw.type, 'paper'),
    url: url === '' ? null : url,
    note: nullableStr(raw.note)
  };
}

const seenSlugs = new Set<string>();

function cleanTopic(raw: RawTopic): Record<string, unknown> | null {
  const slug = str(raw.slug);
  const name = str(raw.name);
  const difficulty = difficultyOf(raw.difficulty);
  if (slug === '' || name === '' || difficulty === null) {
    report.topicsDropped.push(`${slug || name || '<unnamed>'} (bad slug/name/difficulty)`);
    return null;
  }
  if (seenSlugs.has(slug)) {
    report.duplicateSlugs.push(slug);
    report.topicsDropped.push(`${slug} (duplicate across research files)`);
    return null;
  }
  seenSlugs.add(slug);

  const readings = Array.isArray(raw.further_reading) ? raw.further_reading : [];
  const furtherReading: Record<string, unknown>[] = [];
  const seenTitles = new Set<string>();
  for (const entry of readings) {
    const cleaned = cleanReading(entry as RawReading, slug);
    if (!cleaned) continue;
    const title = String(cleaned.title);
    if (seenTitles.has(title)) continue;
    seenTitles.add(title);
    furtherReading.push(cleaned);
  }

  report.topics += 1;
  return {
    slug,
    name,
    difficulty,
    definition: str(raw.definition),
    explanation: str(raw.explanation),
    learningObjectives: strList(raw.learning_objectives),
    keyResults: strList(raw.key_results_or_algorithms),
    mathFoundations: strList(raw.math_foundations),
    applications: strList(raw.applications),
    misconceptions: strList(raw.common_misconceptions),
    openProblems: nullableStr(raw.open_problems),
    historyNote: nullableStr(raw.history_note),
    estMinutes: 30,
    tags: strList(raw.tags),
    prerequisitesStrict: strList(raw.prerequisites_strict),
    prerequisitesRecommended: strList(raw.prerequisites_recommended),
    relatedConcepts: strList(raw.related_concepts),
    advancedExtensions: strList(raw.advanced_extensions),
    furtherReading
  };
}

function build(): void {
  if (!fs.existsSync(researchDir)) {
    console.error(`[curriculum:build] research directory missing: ${researchDir}`);
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const files = fs
    .readdirSync(researchDir)
    .filter((file) => /^[0-9].*\.json$/.test(file))
    .sort();

  if (files.length === 0) {
    console.error('[curriculum:build] no research files found');
    process.exit(1);
  }

  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(researchDir, file), 'utf8')) as {
      area?: unknown;
      domains?: unknown;
    };
    const domains = Array.isArray(raw.domains) ? raw.domains : [];
    const outDomains: Record<string, unknown>[] = [];

    domains.forEach((domainRaw, domainIndex) => {
      const domain = domainRaw as { slug?: unknown; name?: unknown; summary?: unknown; subdomains?: unknown };
      const subdomains = Array.isArray(domain.subdomains) ? domain.subdomains : [];
      const outSubdomains: Record<string, unknown>[] = [];

      subdomains.forEach((subRaw, subIndex) => {
        const sub = subRaw as { slug?: unknown; name?: unknown; summary?: unknown; topics?: unknown };
        const topics = Array.isArray(sub.topics) ? sub.topics : [];
        const outTopics = topics
          .map((topic) => cleanTopic(topic as RawTopic))
          .filter((topic): topic is Record<string, unknown> => topic !== null);
        if (outTopics.length === 0) return;
        report.subdomains += 1;
        outSubdomains.push({
          slug: str(sub.slug),
          name: str(sub.name),
          summary: str(sub.summary),
          order: subIndex,
          topics: outTopics
        });
      });

      if (outSubdomains.length === 0) return;
      report.domains += 1;
      outDomains.push({
        slug: str(domain.slug),
        name: str(domain.name),
        summary: str(domain.summary),
        order: domainIndex,
        subdomains: outSubdomains
      });
    });

    const outFile = path.join(outDir, file);
    fs.writeFileSync(
      outFile,
      `${JSON.stringify(
        { source: `research/${file}`, generatedAt: new Date().toISOString(), domains: outDomains },
        null,
        2
      )}\n`,
      'utf8'
    );
    report.files += 1;
    console.log(`[curriculum:build] ${file} -> data/curriculum/${file} (${outDomains.length} domains)`);
  }

  // Prune relation lists that point at topics dropped elsewhere, so the seeder never sees a
  // dangling prerequisite.
  let pruned = 0;
  for (const file of fs.readdirSync(outDir).filter((f) => f.endsWith('.json'))) {
    const full = path.join(outDir, file);
    const parsed = JSON.parse(fs.readFileSync(full, 'utf8')) as {
      domains: { subdomains: { topics: Record<string, unknown>[] }[] }[];
    };
    for (const domain of parsed.domains) {
      for (const sub of domain.subdomains) {
        for (const topic of sub.topics) {
          for (const key of ['prerequisitesStrict', 'prerequisitesRecommended', 'relatedConcepts', 'advancedExtensions']) {
            const list = topic[key] as string[];
            const kept = list.filter((slug) => seenSlugs.has(slug));
            pruned += list.length - kept.length;
            topic[key] = kept;
          }
        }
      }
    }
    fs.writeFileSync(full, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  }

  console.log(
    `[curriculum:build] ${report.files} files, ${report.domains} domains, ${report.subdomains} subdomains, ${report.topics} topics`
  );
  console.log(`[curriculum:build] readings kept ${report.readingsKept}, dropped ${report.readingsDropped.length}`);
  console.log(`[curriculum:build] dangling relations pruned: ${pruned}`);
  if (report.topicsDropped.length > 0) {
    console.log(`[curriculum:build] topics dropped (${report.topicsDropped.length}):`);
    for (const line of report.topicsDropped.slice(0, 20)) console.log(`  - ${line}`);
  }
  if (report.readingsDropped.length > 0) {
    console.log(`[curriculum:build] sample dropped readings:`);
    for (const line of report.readingsDropped.slice(0, 20)) console.log(`  - ${line}`);
  }
}

build();
