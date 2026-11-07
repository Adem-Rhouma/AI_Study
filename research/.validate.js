const fs = require('fs');
const root = 'C:/Users/rkeks/Documents/project/AI_Study/research/';
const doc = JSON.parse(fs.readFileSync(root + '02-deep-learning-generative-vision.json', 'utf8'));

const SHARED = new Set(
  ('linear-algebra-foundations,matrix-analytical-functions,multivariable-calculus,optimization-convex,' +
    'probability-foundations,statistical-inference,information-theory,numerical-linear-algebra,' +
    'measure-theoretic-probability,graph-theory-foundations,discrete-mathematics,mathematical-logic,' +
    'differential-equations,dynamical-systems,game-theory-foundations,control-theory-foundations,' +
    'computational-complexity,statistical-learning-theory,approximation-theory,topology-for-ml,' +
    'algebraic-geometry-ml,random-matrix-theory,fourier-analysis,functional-analysis,stochastic-calculus,' +
    'supervised-learning-foundations,unsupervised-learning-foundations,model-selection-validation,' +
    'generalization-theory,feature-engineering,probabilistic-graphical-models,markov-decision-processes,' +
    'bellman-equations,policy-gradient-methods,transformer-architecture,attention-mechanisms,' +
    'backpropagation,convolutional-networks,recurrent-networks,diffusion-models,variational-autoencoders,' +
    'generative-adversarial-networks,normalizing-flows,language-model-pretraining,tokenization,' +
    'reinforcement-learning-from-human-feedback,causal-inference-foundations,structural-causal-models,' +
    'graph-neural-networks,monte-carlo-methods,markov-chain-monte-carlo,variational-inference,' +
    'deep-rl-foundations,offline-reinforcement-learning,imitation-learning,sequence-modeling,' +
    'reward-modeling,self-supervised-learning').split(',')
);
const DIFF = new Set(['introductory', 'beginner', 'intermediate', 'advanced', 'expert']);
const TYPE = new Set(['book', 'paper', 'survey', 'lecture-notes', 'course', 'docs', 'blog']);
const REQ = ['slug','name','difficulty','tags','definition','explanation','learning_objectives','prerequisites_strict','prerequisites_recommended','related_concepts','advanced_extensions','key_results_or_algorithms','math_foundations','applications','common_misconceptions','further_reading'];

const own = new Set();
const all = [];
let topics = 0;
for (const d of doc.domains) for (const s of d.subdomains) for (const t of s.topics) { topics++; own.add(t.slug); all.push(t); }
console.log('domains:', doc.domains.length, 'topics:', topics, 'unique own slugs:', own.size);

const probs = [];
for (const d of doc.domains) {
  if (!d.slug || !d.name || !d.summary) probs.push('domain fields ' + d.slug);
  for (const s of d.subdomains) {
    if (!s.slug || !s.name || !s.summary) probs.push('subdomain fields ' + s.slug);
    for (const t of s.topics) {
      for (const k of REQ) if (!(k in t)) probs.push(t.slug + ' missing ' + k);
      if (!DIFF.has(t.difficulty)) probs.push(t.slug + ' bad difficulty');
      if (!Array.isArray(t.tags) || !t.tags.length) probs.push(t.slug + ' empty tags');
      if (!Array.isArray(t.learning_objectives) || t.learning_objectives.length < 4) probs.push(t.slug + ' <4 objectives');
      if (typeof t.explanation !== 'string' || t.explanation.length < 600) probs.push(t.slug + ' short explanation ' + (t.explanation||'').length);
      if (typeof t.definition !== 'string' || t.definition.length < 60) probs.push(t.slug + ' thin definition');
      for (const fr of t.further_reading || []) {
        if (!TYPE.has(fr.type)) probs.push(t.slug + ' bad fr type ' + fr.type);
        if (!fr.title || !fr.authors || typeof fr.year !== 'number') probs.push(t.slug + ' incomplete fr');
        if (fr.url !== null && !/^https?:\/\//.test(fr.url)) probs.push(t.slug + ' bad url');
      }
      if (t.slug !== t.slug.toLowerCase() || /[^a-z0-9-]/.test(t.slug)) probs.push('bad slug form ' + t.slug);
    }
  }
}
// duplicate slug detection across the doc
const cnt = {};
for (const t of all) cnt[t.slug] = (cnt[t.slug]||0)+1;
for (const k in cnt) if (cnt[k] > 1) probs.push('DUPLICATE ' + k);

const unresolved = [];
for (const t of all) for (const key of ['prerequisites_strict','prerequisites_recommended'])
  for (const p of t[key]||[]) if (!SHARED.has(p) && !own.has(p)) unresolved.push(t.slug + ' [' + key + '] -> ' + p);

// self references
const selfrefs = [];
for (const t of all) for (const key of ['prerequisites_strict','prerequisites_recommended'])
  for (const p of t[key]||[]) if (p === t.slug) selfrefs.push(t.slug + ' in ' + key);

console.log('PROBLEMS:', probs.length ? probs : 'none');
console.log('UNRESOLVED PREREQS:', unresolved.length ? unresolved : 'none');
console.log('SELF REFS:', selfrefs.length ? selfrefs : 'none');
console.log('difficulty dist:', JSON.stringify(all.reduce((a,t)=>{a[t.difficulty]=(a[t.difficulty]||0)+1;return a;},{})));
console.log('reading entries:', all.reduce((a,t)=>a+(t.further_reading||[]).length,0), '| min explanation len:', Math.min(...all.map(t=>t.explanation.length)));
console.log('notes_on_gaps present:', !!doc.notes_on_gaps && doc.notes_on_gaps.length > 200, '| area:', doc.area, '| owner:', doc.owner_agent);
