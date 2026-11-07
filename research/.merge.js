const fs = require('fs');

const root = 'C:/Users/rkeks/Documents/project/AI_Study/research/';

// last prose fixes
let p4 = fs.readFileSync(root + '.part4.json', 'utf8');
p4 = p4.replace('used by recent ViT-based one-euro-style models', 'used by recent ViT-based coordinate-MLP decoders');
p4 = p4.replace('the aperture problem), which is why regularization is mandatory', 'the aperture problem), which is why regularization is mandatory');
fs.writeFileSync(root + '.part4.json', p4);

const head = JSON.parse(fs.readFileSync(root + '.part1.json', 'utf8'));
const d2 = JSON.parse(fs.readFileSync(root + '.part2.json', 'utf8'));
const d3 = JSON.parse(fs.readFileSync(root + '.part3.json', 'utf8'));
const d4 = JSON.parse(fs.readFileSync(root + '.part4.json', 'utf8'));

const doc = {
  area: head.area,
  owner_agent: head.owner_agent,
  domains: [head.domains[0], d2, d3, d4],
  notes_on_gaps:
    'Deliberate exclusions and merges. (1) Volume cap: the four scoped areas contain well over 60 topics worth of material, so related items were merged rather than dropped - CNN operators plus the AlexNet-to-EfficientNet-to-ConvNeXt lineage form one topic, RNN/LSTM/GRU plus seq2seq another, positional-encoding mathematics plus long-context extrapolation another, spiking/capsule/liquid plus memory-augmented/DNC plus world-model architectures two topics, autoregressive image/audio generation kept separate from vector-quantized tokenizers but both written as one pipeline pair, and medical imaging plus remote sensing are carried as application threads inside the segmentation, detection, and evaluation topics rather than as their own topics. (2) Topics owned by other agents were referenced by their shared cross-area slugs and not redefined: convolutional-networks, recurrent-networks, attention-mechanisms, transformer-architecture, graph-neural-networks, diffusion-models, variational-autoencoders, generative-adversarial-networks, normalizing-flows, tokenization, self-supervised-learning, sequence-modeling, and all mathematics/ML-core slugs. (3) Deliberately out of scope here: training-systems detail (quantization, pruning, distillation for deployment, kernel/parallel implementation), LLM-specific inference (decoding strategies beyond what AR generation requires, batching/serving), mechanistic interpretability, safety/alignment, video-generation engineering, and 3D-aware generation beyond the NeRF/3DGS/SDS core. (4) Explicitly speculative or contested, flagged inside common_misconceptions rather than presented as settled: mechanistic accounts of grokking, the flat-minima-generalization claim, internal-covariate-shift as the explanation for BatchNorm, the empirical relevance of the NTK to trained networks, whether neural ODEs or SSMs beat residual transformers at scale, capsule-network scalability, the depth of SNN energy-advantage claims, the completeness of 1-WL-style GNN expressiveness theory as a predictor of practice, SDS unbiasedness, and whether FID-style metrics track human preference. (5) Citation honesty: many URLs are null because I would rather omit than guess an arXiv identifier; the few non-null URLs are ones I hold with confidence (deeplearningbook.org, cs231n.stanford.edu, cs236.stanford.edu, web.stanford.edu/class/cs224n, introtodeeplearning.com, jax.readthedocs.io, pytorch.org docs, huggingface.co diffusers, atcold.github.io NYU-DL, arXiv 2405.21060 for Mamba-2 and 2408.00714 for SAM 2, which were checked). Book publication years for Bishop Deep Learning and Prince 2nd edition follow the publisher-year conventions used in the prompt and should be double-checked by a lesson author before print. (6) Difficulty spread is deliberately weighted toward advanced/expert because this area is where the platform demands research-level depth; introductory content for these topics is assumed to live in the ML-core and mathematical-foundations areas.',
};

// ---- validation ----
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
    'reward-modeling,self-supervised-learning')
    .split(',')
);

const DIFF = new Set(['introductory', 'beginner', 'intermediate', 'advanced', 'expert']);
const TYPE = new Set(['book', 'paper', 'survey', 'lecture-notes', 'course', 'docs', 'blog']);

const own = new Set();
const problems = [];
const allTopics = [];
let topicCount = 0;
const slugSeen = {};

for (const d of doc.domains) {
  if (!d.slug || !d.name || !d.summary) problems.push('domain missing fields: ' + d.slug);
  for (const s of d.subdomains) {
    if (!s.slug || !s.name || !s.summary) problems.push('subdomain missing fields in ' + d.slug);
    for (const t of s.topics) {
      topicCount++;
      allTopics.push([d.slug, t]);
      if (own.has(t.slug)) problems.push('DUPLICATE TOPIC SLUG: ' + t.slug);
      own.add(t.slug);
      slugSeen[t.slug] = (slugSeen[t.slug] || 0) + 1;
      const req = ['slug', 'name', 'difficulty', 'tags', 'definition', 'explanation', 'learning_objectives', 'prerequisites_strict', 'prerequisites_recommended', 'related_concepts', 'advanced_extensions', 'key_results_or_algorithms', 'math_foundations', 'applications', 'common_misconceptions', 'further_reading'];
      for (const k of req) if (!(k in t)) problems.push(t.slug + ' missing key ' + k);
      if (!DIFF.has(t.difficulty)) problems.push(t.slug + ' bad difficulty ' + t.difficulty);
      if (!Array.isArray(t.learning_objectives) || t.learning_objectives.length < 4) problems.push(t.slug + ' few learning_objectives');
      if (!Array.isArray(t.tags) || t.tags.length === 0) problems.push(t.slug + ' empty tags');
      if (typeof t.explanation !== 'string' || t.explanation.length < 600) problems.push(t.slug + ' short explanation (' + (t.explanation || '').length + ')');
      for (const fr of t.further_reading || []) {
        if (!TYPE.has(fr.type)) problems.push(t.slug + ' bad fr type ' + fr.type);
        if (!fr.title || !fr.authors || typeof fr.year !== 'number') problems.push(t.slug + ' incomplete fr: ' + JSON.stringify(fr).slice(0, 90));
        if (fr.url !== null && !/^https?:\/\//.test(fr.url)) problems.push(t.slug + ' bad url ' + fr.url);
      }
      for (const key of ['prerequisites_strict', 'prerequisites_recommended']) {
        for (const p of t[key] || []) {
          if (!SHARED.has(p) && !own.has(p)) {
            // may resolve to a topic defined later in this doc; record for second pass
            problems.push('UNRESOLVED-REF(' + key + ') in ' + t.slug + ': ' + p);
          }
        }
      }
    }
  }
}

// second pass now that all own slugs are known
const unresolved = [];
for (const [ds, t] of allTopics) {
  for (const key of ['prerequisites_strict', 'prerequisites_recommended', 'related_concepts', 'advanced_extensions']) {
    for (const p of t[key] || []) {
      if (key === 'advanced_extensions' || key === 'related_concepts') continue; // these are topic-local concept names, not enforced
      if (!SHARED.has(p) && !own.has(p)) unresolved.push(t.slug + ' [' + key + '] -> ' + p);
    }
  }
}

console.log('domains:', doc.domains.length, 'topics:', topicCount, 'own slugs:', own.size);
console.log('UNRESOLVED PREREQ REFS:', unresolved.length ? unresolved : 'none');
const realProblems = problems.filter((p) => !p.startsWith('UNRESOLVED-REF'));
console.log('OTHER PROBLEMS:', realProblems.length ? realProblems : 'none');
fs.writeFileSync(root + '02-deep-learning-generative-vision.json', JSON.stringify(doc, null, 2));
console.log('written');
