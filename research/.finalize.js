const fs = require('fs');
const root = 'C:/Users/rkeks/Documents/project/AI_Study/research/';
const doc = JSON.parse(fs.readFileSync(root + '02-deep-learning-generative-vision.json', 'utf8'));

const TAGS = {
  'perceptron-to-multilayer-networks-history': ['history', 'foundations', 'feedforward-networks'],
  'universal-approximation-and-depth': ['approximation-theory', 'depth', 'expressivity'],
  'backpropagation-autodiff-forward-reverse': ['automatic-differentiation', 'gradients', 'computation-graphs'],
  'optimization-for-neural-networks': ['optimization', 'learning-rate-schedules', 'training'],
  'gradient-pathologies-initialization-theory': ['initialization', 'signal-propagation', 'numerical-stability'],
  'normalization-layers-mathematics': ['normalization', 'batch-norm', 'layer-norm'],
  'activation-functions-mathematics': ['nonlinearities', 'activation-functions'],
  'normalization-and-regularization-for-deep-networks': ['regularization', 'dropout', 'data-augmentation', 'weight-decay'],
  'residual-connections-and-ode-view': ['residual-networks', 'dynamical-systems', 'neural-odes'],
  'infinite-width-limit-ntk-mean-field': ['kernel-methods', 'mean-field', 'scaling-limits', 'theory'],
  'loss-landscapes-and-grokking': ['generalization', 'loss-landscape', 'grokking', 'double-descent'],
  'convolutional-architectures-operations-and-lineage': ['convolutions', 'cnn', 'efficient-networks', 'receptive-field'],
  'recurrent-networks-lstm-gru-seq2seq': ['recurrent-networks', 'lstm', 'seq2seq'],
  'attention-mechanics-scaled-dot-product-kv-cache': ['attention', 'kv-cache', 'inference'],
  'transformer-block-internals-normalization-mlp-stacking': ['transformers', 'normalization-placement', 'mlp-blocks'],
  'positional-encoding-mathematics-rope-alibi-long-context': ['positional-encoding', 'rope', 'alibi', 'long-context'],
  'sub-quadratic-attention-sparsemax-linear-attention': ['sparse-attention', 'sparsemax', 'linear-attention', 'efficiency'],
  'vision-transformer-and-hybrid-backbones': ['vision-transformer', 'hybrid-backbones', 'attention'],
  'state-space-models-s4-mamba-rwkv-hybrids': ['state-space-models', 'mamba', 'rwkv', 'sub-quadratic'],
  'graph-neural-networks-message-passing-expressiveness': ['gnn', 'message-passing', 'expressiveness', 'graphs'],
  'neural-operators-deeponet-fno': ['neural-operators', 'scientific-ml', 'pde-learning'],
  'mixture-of-experts-sparse-computation': ['moe', 'sparse-computation', 'routing', 'distributed-training'],
  'neural-architecture-search-for-architectures': ['nas', 'differentiable-search', 'weight-sharing', 'meta-learning'],
  'diffusion-transformer-architecture': ['diffusion-transformer', 'generative-backbones', 'conditioning'],
  'specialized-and-world-model-architectures': ['spiking-networks', 'capsules', 'liquid-networks', 'external-memory', 'world-models'],
  'generative-model-landscape-likelihood-elbo-ebm': ['generative-models', 'elbo', 'energy-based-models', 'likelihood'],
  'vae-latent-variable-objectives': ['latent-variable-models', 'vae', 'posterior-collapse'],
  'gan-dynamics-equilibria-lineage': ['gans', 'minimax-games', 'wasserstein', 'stylegan'],
  'normalizing-flow-design-exact-likelihood': ['normalizing-flows', 'change-of-variables', 'exact-likelihood'],
  'vector-quantized-tokenizers-for-generation': ['vector-quantization', 'tokenizers', 'codebooks'],
  'autoregressive-image-audio-generation': ['autoregressive-models', 'image-generation', 'audio-generation'],
  'score-matching-diffusion-theory': ['score-matching', 'diffusion', 'ddpm', 'ddim'],
  'flow-matching-rectified-and-discrete-diffusion': ['flow-matching', 'rectified-flow', 'discrete-diffusion'],
  'diffusion-sampling-and-inference-time-scaling': ['samplers', 'classifier-free-guidance', 'inference-time-scaling'],
  'generative-evaluation-metrics-and-failure-modes': ['evaluation', 'fid', 'precision-recall', 'metrics'],
  'classical-vision-image-processing-and-feature-based-recognition': ['image-processing', 'scale-space', 'feature-detection', 'classical-vision'],
  'geometric-vision-camera-geometry-depth-sfm-and-slam': ['epipolar-geometry', 'calibration', 'sfm', 'slam', 'stereo'],
  'image-classification-recipes-and-modern-vision-training': ['image-classification', 'training-recipes', 'transfer-learning', 'calibration'],
  'object-detection-and-pose-estimation': ['object-detection', 'keypoints', 'set-prediction', 'fpn'],
  'segmentation-from-unet-to-sam': ['segmentation', 'unet', 'panoptic', 'promptable-segmentation', 'medical-imaging'],
  'motion-pose-and-video-understanding': ['optical-flow', 'multi-object-tracking', 'video-understanding'],
  'three-dimensional-representations-point-clouds-neural-rendering-gaussian-splatting': ['point-clouds', 'nerf', 'gaussian-splatting', '3d-vision'],
  'human-pose-estimation-and-body-reconstruction': ['pose-estimation', 'smpl', 'body-reconstruction'],
  'self-supervised-visual-representation-learning': ['self-supervision', 'contrastive-learning', 'masked-image-modeling', 'distillation'],
  'vision-language-models-and-visual-reasoning': ['vision-language', 'clip', 'multimodal', 'visual-reasoning'],
  'evaluation-benchmarking-in-computer-vision': ['evaluation', 'benchmarking', 'adversarial-robustness', 'distribution-shift', 'remote-sensing'],
};

function find(slug) {
  for (const d of doc.domains)
    for (const s of d.subdomains) {
      const i = s.topics.findIndex((t) => t.slug === slug);
      if (i >= 0) return { list: s.topics, i, sub: s };
    }
  return null;
}

function union(a, b) {
  return [...new Set([...a, ...(b || [])])];
}

// ---- merge 1 (architectures): spiking/capsule/liquid + memory-augmented/world models
{
  const A = find('spiking-capsule-liquid-networks');
  const B = find('memory-augmented-and-world-model-architectures');
  const a = A.list[A.i], b = B.list[B.i];
  const merged = {
    slug: 'specialized-and-world-model-architectures',
    name: 'Spiking, Capsule, Liquid, Memory-Augmented, and World-Model Architectures',
    difficulty: 'advanced',
    tags: TAGS['specialized-and-world-model-architectures'],
    definition:
      'A family of architectures that each reject one mainstream assumption - continuous different activations (spiking), scalar per-unit features (capsules), fixed time constants (liquid networks), state-only memory (external-memory networks), or direct policy learning (world models) - and pay for it with a harder optimization problem.',
    explanation:
      'Spiking networks propagate discrete events through leaky-integrate-and-fire dynamics (dv/dt = (input - (v - v_rest))/tau with threshold and reset), so information lives in spike timing and the network is asynchronous by construction; because spikes are nondifferentiable, learning uses surrogate gradients (a smooth kernel replacing the threshold derivative, now the standard and it trains deep SNNs), ANN-to-SNN conversion with discretization error bounds, or local STDP rules, and the reason the family survives is energy on event-driven hardware (Loihi-class chips) for sensing/streaming workloads - while the honest caveat is that SNNs still trail ANNs on static vision benchmarks, so accuracy and energy must not be conflated. Capsule networks (Hinton, Sabour) replace scalars with vectors whose length is an existence probability and whose orientation is pose, predicting a child capsule\'s pose by a learned transformation and coupling layers by dynamic routing-by-agreement, an EM-like iterative fixed point; what they recover is exactly what pooling destroys - the part-whole pose relationship - giving viewpoint and occlusion robustness on small data, and what stopped them scaling is slow unstable routing and fragile equivariance, since modern models buy the same robustness from data plus relative positional encodings. Liquid neural networks (Hasani et al.) are continuous-time recurrent cells whose time constants are functions of the input, so effective memory adapts online; their motivation is closed-loop control on real robots under unanticipated perturbation, and they sit technically between reservoir computing and neural ODEs. The memory-augmented lineage argues that a fixed-width hidden state must both represent and store, so an external matrix of slots with content-based addressing (NTM\'s key-query soft addressing with interpolation/sharpening, DNC\'s linked-list temporal addressing and usage-based allocation) gives near-unbounded, addressable storage with trained algorithms (copy, associative recall); the sober lesson is that these models were displaced not because memory was wrong but because a transformer\'s attention over context - and operationally its growing KV-cache - is a soft, differentiable, larger memory that trains far more easily, which is also why retrieval-augmented and kNN-augmented systems are the lineage\'s descendants. World models make the complementary move of learning the environment\'s latent dynamics so that prediction and control happen inside the model: Ha and Schmidhuber\'s VAE plus MDN-RNN, PlaNet\'s Recurrent State-Space Model (deterministic hidden state plus stochastic latent, trained by an ELBO with prior and posterior, planned against with MPPI-style sampling), and Dreamer/DreamerV3\'s imagined rollouts for policy and value learning; JEPA-style latent-predictive objectives port the same idea to representation learning by predicting a teacher\'s representation rather than pixels, so capacity is not spent on unpredictable detail. The shared open problems are real and worth stating plainly: compounding model error limits imagination horizons, memory capacity in learned systems remains far from what the addressability argument suggests, and biological plausibility or theoretical elegance has repeatedly failed to predict engineering adoption.',
    learning_objectives: [
      'Write the LIF dynamics and its discretization, and describe rate, temporal and population spike codes.',
      'Explain surrogate-gradient training in SNNs and the ANN-to-SNN conversion error argument.',
      'Describe capsule pose prediction and dynamic routing, and explain what pooling destroys that capsules restore.',
      'Define an input-dependent time constant and explain why it helps closed-loop control.',
      'Contrast NTM content-based addressing with DNC temporal linking and usage-based allocation.',
      'Write the RSSM generative model and its ELBO, distinguishing prior from posterior latents, and explain why imagination is cheap.',
      'Argue in what sense attention with a KV-cache is a differentiable external memory, and where the analogy breaks.',
    ],
    prerequisites_strict: union(a.prerequisites_strict, ['recurrent-networks-lstm-gru-seq2seq', 'attention-mechanics-scaled-dot-product-kv-cache']),
    prerequisites_recommended: union(a.prerequisites_recommended, ['differential-equations', 'deep-rl-foundations', 'markov-decision-processes', 'variational-autoencoders', 'control-theory-foundations']),
    related_concepts: union(union(a.related_concepts, b.related_concepts), ['residual-connections-and-ode-view', 'state-space-models-s4-mamba-rwkv-hybrids']),
    advanced_extensions: union(a.advanced_extensions, b.advanced_extensions),
    key_results_or_algorithms: union(a.key_results_or_algorithms, b.key_results_or_algorithms),
    math_foundations: union(a.math_foundations, b.math_foundations),
    applications: union(a.applications, b.applications),
    common_misconceptions: union(a.common_misconceptions, b.common_misconceptions),
    further_reading: unionByTitle(a.further_reading, b.further_reading),
  };
  A.list[A.i] = merged;
  const B2 = find('memory-augmented-and-world-model-architectures');
  B2.list.splice(B2.i, 1);
}

function unionByTitle(x, y) {
  const seen = new Set();
  const out = [];
  for (const e of [...x, ...y]) {
    if (seen.has(e.title)) continue;
    seen.add(e.title);
    out.push(e);
  }
  return out;
}

// ---- merge 2 (vision): optical flow/MOT/video + human pose
{
  const A = find('optical-flow-tracking-and-video-understanding');
  const B = find('human-pose-estimation-and-body-reconstruction');
  const a = A.list[A.i], b = B.list[B.i];
  const merged = {
    slug: 'motion-pose-and-video-understanding',
    name: 'Motion, Multi-Object Tracking, Pose, and Video Understanding',
    difficulty: 'advanced',
    tags: TAGS['motion-pose-and-video-understanding'],
    definition:
      'Temporal and structured visual estimation: optical flow gives a per-pixel apparent-motion field, multi-object tracking associates detections into trajectories, human pose estimation gives per-person articulated structure, and video understanding aggregates all of it over time for recognition, grounding, and prediction.',
    explanation:
      'Flow follows from brightness constancy, I_x u + I_y v + I_t = 0: one equation in two unknowns per pixel (the aperture problem), which is why a smoothness prior is mandatory - Horn-Schunck minimizes a global variational objective, Black-Rangarajan style robust anisotropic regularization handles motion boundaries, and large displacements require coarse-to-fine warping or dense patch matching (DeepFlow). RAFT is the modern template for why learning helps: it builds all-pairs correlations and then refines flow by repeatedly warping features to the current estimate and passing the update through a shared GRU cell, an unrolled optimization made learnable, which explains both its accuracy and its cross-dataset generalization, while its failure cases (untextured regions, motion blur, occlusions) are precisely the ones the classical literature names; evaluation uses EPE, the 1-pixel-out error and occlusion-aware variants on Sintel/KITTI. Tracking is the association layer above detection: a constant-velocity or Kalman motion model, an appearance embedding, a cost matrix combining IoU and appearance distance, and Hungarian assignment (SORT), refined by a Mahalanobis gate (DeepSORT) and by soft use of low-confidence detections to carry trajectories through occlusion (ByteTrack), with track-former designs replacing hand-tuned association with attention over track tokens - and metrics that genuinely change conclusions: MOTA penalizes identity switches but hides fragmentation, IDF1 is a track-level F1, HOTA factorizes detection, association and localization. Pose estimation is the same many-object/many-part structure with a different output: bottom-up pipelines predict keypoint heatmaps plus part-affinity fields whose line integrals make limb association differentiable (OpenPose) or position-interval fields that disambiguate overlapping limbs (PIF), top-down pipelines detect then regress per person, and HRNet keeps a high-resolution stream through repeated multi-scale fusion because localization precision, not classification, is the bottleneck; the heatmap-versus-coordinate question is a real modeling tradeoff (soft-argmax heatmaps are sub-pixel precise but memory-hungry, direct coordinate MLPs are cheap and resolution-free but average ambiguous configurations), 3D lifting from monocular video needs priors (root-relative parameterization, bone-length and temporal smoothness - VideoPose3D showed most monocular 3D error is temporal jitter), and full-body recovery fits SMPL/SMPL-X linear blend-skinned templates, which constrains the output space and enables photometric optimization; pose now also serves as a control signal for generative video. At the sequence level, recognition moved from TSN temporal segment voting through inflated 3D convolutions (I3D, R(2+1)D factorization) and SlowFast\'s high-rate-appearance/low-rate-motion two pathways to ViViT-style spatial-then-temporal tokenization, whose cost is the quadratic attention over spatiotemporal tokens; VideoMAE is the instructive self-supervised result - masking around 90 percent of tubelets still reconstructs, because inter-frame redundancy is enormous - and temporal consistency is the shared difficulty connecting video understanding, video prediction, and world-model architectures. Finally, benchmark and bias caveats belong with the methods: pose datasets carry demographic and viewpoint skews that transfer to deployed systems, tracking benchmarks reward specific metric choices, and video recognition results are strongly protocol-dependent (frame sampling, clip length, test-time aggregation).',
    learning_objectives: a.learning_objectives.concat(b.learning_objectives),
    prerequisites_strict: union(a.prerequisites_strict, ['object-detection-and-pose-estimation']),
    prerequisites_recommended: union(a.prerequisites_recommended, ['vision-transformer-and-hybrid-backbones', 'geometric-vision-camera-geometry-depth-sfm-and-slam', 'three-dimensional-representations-point-clouds-neural-rendering-gaussian-splatting', 'optimization-convex']),
    related_concepts: union(union(a.related_concepts, b.related_concepts), ['segmentation-from-unet-to-sam']),
    advanced_extensions: union(a.advanced_extensions, b.advanced_extensions),
    key_results_or_algorithms: union(a.key_results_or_algorithms, b.key_results_or_algorithms),
    math_foundations: union(a.math_foundations, b.math_foundations),
    applications: union(a.applications, b.applications),
    common_misconceptions: union(a.common_misconceptions, b.common_misconceptions),
    further_reading: unionByTitle(a.further_reading, b.further_reading),
  };
  A.list[A.i] = merged;
  const B2 = find('human-pose-estimation-and-body-reconstruction');
  B2.list.splice(B2.i, 1);
}

// reference fixups
const REFIX = {
  'transformer-block-internals-design': 'transformer-block-internals-normalization-mlp-stacking',
  'autoregressive-decoding-strategies': 'information-theory',
  'optimal-transport-and-assignment': 'optimization-convex',
  'human-pose-estimation-and-body-reconstruction': 'motion-pose-and-video-understanding',
  'optical-flow-tracking-and-video-understanding': 'motion-pose-and-video-understanding',
  'spiking-capsule-liquid-networks': 'specialized-and-world-model-architectures',
  'memory-augmented-and-world-model-architectures': 'specialized-and-world-model-architectures',
};
function remap(arr) {
  if (!arr) return arr;
  return [...new Set(arr.map((x) => REFIX[x] || x))];
}

let ntopics = 0;
for (const d of doc.domains)
  for (const s of d.subdomains)
    for (const t of s.topics) {
      ntopics++;
      t.tags = t.tags && t.tags.length ? t.tags : TAGS[t.slug];
      if (!t.tags || !t.tags.length) console.log('NO TAGS: ' + t.slug);
      for (const k of ['prerequisites_strict', 'prerequisites_recommended', 'related_concepts']) {
        t[k] = remap(t[k]);
      }
      // drop self references
      for (const k of ['prerequisites_strict', 'prerequisites_recommended', 'related_concepts', 'advanced_extensions']) {
        t[k] = (t[k] || []).filter((x) => x !== t.slug);
      }
    }

console.log('topics after merges:', ntopics);
fs.writeFileSync(root + '02-deep-learning-generative-vision.json', JSON.stringify(doc, null, 2));
