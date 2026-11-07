const fs = require('fs');
const root = 'C:/Users/rkeks/Documents/project/AI_Study/research/';
const files = ['01-math-and-classical-ml.json','03-rl-language-multimodal.json','04-symbolic-probabilistic-graph-embodied.json','05a-systems-mlops.json','05b-safety-science.json'];
const mine = JSON.parse(fs.readFileSync(root + '02-deep-learning-generative-vision.json','utf8'));
const ownSlugs = new Set();
for (const d of mine.domains) for (const s of d.subdomains||[]) for (const t of s.topics||[]) ownSlugs.add(t.slug);
for (const f of files) {
  let doc;
  try { doc = JSON.parse(fs.readFileSync(root + f,'utf8')); } catch (e) { console.log(f, 'SKIP', e.message.slice(0,60)); continue; }
  const other = new Set();
  for (const d of doc.domains||[]) for (const s of d.subdomains||[]) for (const t of s.topics||[]) other.add(t.slug);
  const clash = [...ownSlugs].filter(x => other.has(x));
  console.log(f, 'topics:', other.size, 'COLLISIONS:', clash.length ? clash : 'none');
}
