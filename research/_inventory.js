/* Read-only inventory + integrity scan over the research JSON deliverables.
   Reports coverage per domain and flags citation text that looks unresolved, so nothing invented reaches the seed. */
const fs = require('fs');
const path = require('path');

const SUSPICIOUS = [
  { name: 'placeholder-question', re: /\b[A-Za-z]{3,}\?\s/ },
  { name: 'unresolved-instruction', re: /\(use:/i },
  { name: 'tbd', re: /\bTBD\b|\bTODO\b|\bFIXME\b|placeholder/i },
  { name: 'uncertain', re: /\b(uncertain|verify|unverified|possibly|maybe authored|not sure)\b/i }
];

const dir = process.argv[2] || '.';
const files = fs
  .readdirSync(dir)
  .filter((f) => /^\d\d[a-z]?-.*\.json$/.test(f))
  .sort();

const allSlugs = new Map();
let grandTopics = 0;

for (const file of files) {
  const raw = fs.readFileSync(path.join(dir, file), 'utf8').replace('##END##', '');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.log(`\n### ${file}  INVALID JSON: ${e.message.slice(0, 90)}`);
    continue;
  }
  let topics = 0;
  const lines = [];
  const flags = [];
  for (const domain of data.domains || []) {
    const subCount = (domain.subdomains || []).length;
    const names = [];
    for (const sub of domain.subdomains) {
      topics += sub.topics.length;
      for (const t of sub.topics) {
        allSlugs.set(t.slug, (allSlugs.get(t.slug) || 0) + 1);
        const blob = JSON.stringify(t);
        for (const check of SUSPICIOUS) {
          if (check.re.test(blob)) flags.push(`${check.name}: ${file} / ${t.slug}`);
        }
        for (const ref of [
          ...(t.prerequisites_strict || []),
          ...(t.prerequisites_recommended || []),
          ...(t.related_concepts || []),
          ...(t.advanced_extensions || [])
        ]) {
          (t.__refs ||= []).push(ref);
        }
        if (!t.definition || !t.explanation) flags.push(`empty-core: ${file} / ${t.slug}`);
      }
      names.push(`${sub.name}(${sub.topics.length})`);
    }
    lines.push(`  ${domain.name} — ${subCount} subdomains, ${topics} so far`);
    lines.push(`      ${names.join(', ')}`);
  }
  grandTopics += topics;
  console.log(`\n### ${file}  topics=${topics} domains=${(data.domains || []).length}`);
  console.log(lines.join('\n'));
}

const dupes = [...allSlugs.entries()].filter(([, count]) => count > 1);
console.log(`\n=== TOTAL topics=${grandTopics} unique slugs=${allSlugs.size} duplicates=${dupes.length}`);
if (dupes.length) console.log(dupes.map(([s, c]) => `${s} x${c}`).join(', '));

const dangling = new Map();
for (const file of files) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8').replace('##END##', ''));
  } catch {
    continue;
  }
  for (const domain of data.domains || [])
    for (const sub of domain.subdomains || [])
      for (const t of sub.topics || [])
        for (const ref of t.__refs || [])
          if (!allSlugs.has(ref)) {
            const key = `${file}: ${t.slug} -> ${ref}`;
            dangling.set(key, (dangling.get(key) || 0) + 1);
          }
}
console.log(`=== dangling references: ${dangling.size}`);
[...dangling.keys()].slice(0, 40).forEach((k) => console.log('  ' + k));
