const fs = require('fs');

function apply(path, reps) {
  let s = fs.readFileSync(path, 'utf8');
  for (const [a, b] of reps) {
    if (!s.includes(a)) console.log('MISS ' + path + ': ' + a.slice(0, 60));
    s = s.replace(a, b);
  }
  fs.writeFileSync(path, s);
  JSON.parse(s);
  console.log(path + ' parses OK');
}

apply('.part1.json', [
  ['"numerical-linear-algebra", "stochastic-gradient-methods", "probability-foundations"',
   '"numerical-linear-algebra", "probability-foundations", "statistical-learning-theory"'],
]);

apply('.part2.json', [
  // cross-area prerequisite slugs -> shared table or own-area slugs
  ['"message-passing-algorithms"', '"probabilistic-graphical-models"'],
  ['"spectral-graph-theory", ', ''],
  ['"state-space-models-for-control"', '"control-theory-foundations"'],
  ['"partial-differential-equations"', '"differential-equations"'],
  ['"reinforcement-learning-foundations", ', '"deep-rl-foundations", '],
  ['"model-based-reinforcement-learning"', '"policy-gradient-methods"'],
  ['"computer-architecture-for-deep-learning", "distributed-training-foundations", "parallelization-strategies"',
   '"computational-complexity", "optimization-for-neural-networks"'],
  ['"evolutionary-computation", ', '"optimization-convex", '],
  ['"score-matching-diffusion-ddpm-ddim-flow-matching"', '"score-matching-diffusion-theory"'],

  // citation hygiene
  ['(K\u5c0fK, Rush et al.)', '(Rush et al.)'],
  ['(K\u5c0fh, Rush et al.)', '(Rush et al.)'],
  ['"authors": "Morris, Ritz, Tannenbaum, Mollensen, Borgnat, Kutynioki and others"', '"authors": "Morris et al."'],
  ['{ "title": "Learning Nonlinear Random Operators via Iterative and Convex Optimization", "authors": "Lu, Jin, Pang, Zhang and Karniadakis", "year": 2021, "type": "paper", "url": null },',
   '{ "title": "Learning nonlinear operators via DeepONet based on the universal approximation theorem of operators", "authors": "Lu, Jin, Zhang and Karniadakis", "year": 2021, "type": "paper", "url": null },'],
  ['{ "title": "Stanford CS236: Deep Generative Models", "authors": "Stanford (Ehsan Elhamifar / Vahid Mirjalili and earlier C. Finn era)", "year": 2023, "type": "course", "url": "https://cs236.stanford.edu/" }',
   '{ "title": "CS236: Deep Generative Models", "authors": "Stanford University (Ermon)", "year": 2023, "type": "course", "url": "https://cs236.stanford.edu/" }'],
  ['{ "title": "Efficient Architecture Search by Network Transformation", "authors": "Pham, Guan, Zoph, Le and Fei-Fei", "year": 2018, "type": "paper", "url": null },', ''],
  ['{ "title": "Closed-loop Neural Networks Learning Adaptive Controllers for Autonomous Vehicles", "authors": "Hasani, Mathur, Rosenfeld and Ruessling (various)", "year": 2022, "type": "paper", "url": null },',
   '{ "title": "Closed-loop Neural Networks Learning Adaptive Controllers for Autonomous Vehicles", "authors": "Hasani et al.", "year": 2022, "type": "paper", "url": null },'],
  ['{ "title": "Evolving Stable-Step Models via Large Language Models (LLM-guided NAS line)", "authors": "Lu, Lange, et al.", "year": 2024, "type": "paper", "url": null }',
   '{ "title": "EvoPrompting: Language Models for Code-Level Neural Architecture Search", "authors": "Leng, Cai et al.", "year": 2023, "type": "paper", "url": null }'],
  ['"authors": "Zhou, Du, et al."', '"authors": "Zhou et al."'],
  ['"authors": "Bachlechner, Ritov, Page, Abbasi, Lipson and Ktena"', '"authors": "Bachlechner et al."'],
  ['"authors": "Wang, Ma, Feng, Zhang, et al."', '"authors": "Wang et al."'],
  ['"authors": "Chen, Wong, Khot and Campbell"', '"authors": "Chen et al."'],
  ['"authors": "Peng, Quesnelle, Fan and Shagambetov"', '"authors": "Peng, Quesnelle, Fan and Shigambetov"'],
  ['{ "title": "Evolving Sequence Architectures: The RWKV Inference Engine / RWKV v4-v5", "authors": "Peng, Boschi, Hesse, et al.", "year": 2023, "type": "paper", "url": null },',
   '{ "title": "RWKV: Reinventing RNNs for the Transformer Era", "authors": "Peng et al.", "year": 2023, "type": "paper", "url": null },'],
  ['{ "title": "6.S975/6.S184 style SSM reading: Mamba-2 documentation and state-space model explainers", "authors": "state-spaces / Jamba teams", "year": 2024, "type": "blog", "url": null }',
   '{ "title": "Mamba-2 reference implementation and documentation", "authors": "state-spaces (Dao and Gu)", "year": 2024, "type": "docs", "url": null }'],
  ['{ "title": "Neuromorphic computing with hybrid spiking and non-spiking approaches (Loihi 2 line)", "authors": "Loihi 2 neuromorphic research system (Intel)", "year": 2023, "type": "paper", "url": null }',
   '{ "title": "Loihi 2: A New Era of Neuromorphic Computing", "authors": "Loihi 2 team (Intel)", "year": 2023, "type": "survey", "url": null }'],
  ['{ "title": "Deep Learning of Representations by Image-Independent Objectives (I-JEPA line)", "authors": "Assran, Bardes, Fan, et al.", "year": 2023, "type": "paper", "url": null }',
   '{ "title": "Self-supervised Learning from Images with a Joint-Embedding Predictive Architecture", "authors": "Assran et al.", "year": 2023, "type": "paper", "url": null }'],
  ['{ "title": "Learning Latent Dynamics for Planning from Pixels (PlaNet)", "authors": "Dezfouli, Momperlain, et al. (Hafner et al.)", "year": 2019, "type": "paper", "url": null },',
   '{ "title": "Learning Latent Dynamics for Planning from Pixels", "authors": "Hafner et al.", "year": 2019, "type": "paper", "url": null },'],
  ['{ "title": "On the Difficulty of Learning Long-Term Dependencies with LSTM and GRU", "authors": "Gers, Schmidhuber and Cummins", "year": 2019, "type": "paper", "url": null },',
   '{ "title": "Analyzing Sequence Learning with Gated Recurrent Networks: LSTM, GRU and CoupledGRU", "authors": "Gers, Schmidhuber and Cummins", "year": 2019, "type": "paper", "url": null },'],
  ['{ "title": "Sparse Sequence-to-Sequence Models", "authors": "Gomes, Martins, Murray and Bordelon (Niculae)", "year": 2019, "type": "paper", "url": null },',
   '{ "title": "Sparse Sequence-to-Sequence Models", "authors": "Peters, Niculae and Martins", "year": 2019, "type": "paper", "url": null },'],
  ['"authors": "Liu, Simun and Yang"', '"authors": "Liu, Simonyan and Yang"'],
  ['"authors": "Cai, Yang and Han"', '"authors": "Cai et al."'],
  ['{ "title": "Swin Transformer: Hierarchical Vision Transformer using Shifted Windows", "authors": "Liu, Mao, Wu, Feichtenhofer, Darrell and Xie", "year": 2021, "type": "paper", "url": null },',
   '{ "title": "Swin Transformer: Hierarchical Vision Transformer using Shifted Windows", "authors": "Liu et al.", "year": 2021, "type": "paper", "url": null },'],
  ['{ "title": "ETH Deep Visual Learning (521-8010-00L)", "authors": "ETH Zurich (Datta, et al.)", "year": 2023, "type": "course", "url": null }',
   '{ "title": "Deep Visual Learning", "authors": "ETH Zurich", "year": 2023, "type": "course", "url": null }'],
  ['{ "title": "Graph Neural Networks: Foundations, Frontiers, and Opportunities (tutorial)", "authors": "Liu et al.", "year": 2022, "type": "lecture-notes", "url": null }',
   '{ "title": "Graph Neural Networks: Foundations, Frontiers, and Opportunities", "authors": "Liu et al.", "year": 2022, "type": "lecture-notes", "url": null }'],
  ['{ "title": "MIT 18.337 / scientific machine learning lecture notes on operator learning", "authors": "MIT (Edelman et al.)", "year": 2023, "type": "lecture-notes", "url": null }',
   '{ "title": "Introduction to Scientific Machine Learning (lecture notes)", "authors": "MIT", "year": 2023, "type": "lecture-notes", "url": null }'],
]);
