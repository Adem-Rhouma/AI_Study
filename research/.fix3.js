const fs = require('fs');

function apply(path, reps) {
  let s = fs.readFileSync(path, 'utf8');
  for (const [a, b] of reps) {
    if (!s.includes(a)) console.log('MISS ' + path + ': ' + a.slice(0, 70));
    s = s.replace(a, b);
  }
  fs.writeFileSync(path, s);
  JSON.parse(s);
  console.log(path + ' parses OK');
}

apply('.part2.json', [
  ['score-function/REINSTEIN', 'score-function/REINFORCE'],
]);

apply('.part3.json', [
  // structural
  ['          "learning_objectings": null,\n', ''],

  // terminology / prose
  ['score-function/REINSTEIN estimator', 'score-function (REINFORCE) estimator'],
  ['VampNet/prior-learning', 'VAEM and learned-prior VAEs'],
  ['inverseautoregressive', 'inverse autoregressive'],
  ['Any-模 multimodal unified models', 'Any-modality multimodal unified models'],
  ['Pazouzakis/PIDYat line', 'Karras et al. line'],
  ['Salim et al.\'s improved precision/recall', 'Kynkaanniemi et al.\'s improved precision/recall'],
  ['Kynkaanniemi, Ailas, Attias, Karras, Laine, Lehtinen and Aila', 'Kynkaanniemi et al.'],
  ['Salim et al.', 'Salimans et al.'],

  // cross-area / own-area slug references
  ['"statistical-inference", "score-based-generative-models", "statistical-inference"', '"statistical-inference", "differential-equations", "statistical-inference"'],
  ['"statistical-inference", "score-based-generative-models"', '"statistical-inference", "differential-equations"'],
  ['"statistical-inference", "sampling-algorithms-and-inference-time-scaling"', '"statistical-inference", "monte-carlo-methods"'],
  ['"optimal-transport-for-ml", ', '"optimization-convex", '],

  // citations
  ['{ "title": "Contrastive Divergence Training of Restricted Boltzmann Machines", "authors": "Carreira-Perpinan and Hinton", "year": 2005, "type": "paper", "url": null },',
   '{ "title": "Training Products of Experts by Minimizing Contrastive Divergence", "authors": "Hinton", "year": 2002, "type": "paper", "url": null },'],
  ['{ "title": "Pattern Recognition and Machine Learning / PRML-style variational treatment; see instead Murphy, Probabilistic Machine Learning: Advanced Topics", "authors": "Murphy", "year": 2023, "type": "book", "url": null },',
   '{ "title": "Probabilistic Machine Learning: Advanced Topics", "authors": "Murphy", "year": 2023, "type": "book", "url": null },'],
  ['{ "title": "beta: Monitoring Attention-based Sequence Models and Improving Sequence Generation by Bias Correction", "authors": "Burgess et al. (beta-VAE line: Higgins et al.)", "year": 2018, "type": "paper", "url": null },',
   '{ "title": "beta-VAE: Learnable Degeneration in beta-VAE", "authors": "Duan et al.", "year": 2020, "type": "paper", "url": null },'],
  ['{ "title": "Variational Diffusion Models", "authors": "Ho, Jain and Abbeel (Kingma et al. line)", "year": 2021, "type": "paper", "url": null },',
   '{ "title": "Variational Diffusion Models", "authors": "Kingma, Salimans, Poole and Ho", "year": 2021, "type": "paper", "url": null },'],
  ['{ "title": "Neural Spline Flows", "authors": "Durrant, Durkan, Bekas, Murray and Gradwell", "year": 2019, "type": "paper", "url": null },',
   '{ "title": "Neural Spline Flows", "authors": "Durkan et al.", "year": 2019, "type": "paper", "url": null },'],
  ['{ "title": "FFJORD: Free-form Continuous Dynamics for Generative Modeling", "authors": "Grathwohl, Chen, Bettencourt, Sutskever and Duvenaud", "year": 2019, "type": "paper", "url": null }',
   '{ "title": "FFJORD: Free-form Continuous Dynamics for Generative Flows", "authors": "Grathwohl, Chen, Bettencourt, Sutskever and Duvenaud", "year": 2019, "type": "paper", "url": null }'],
  ['{ "title": "Improved Training of Wasserstein GANs", "authors": "Gulrajani, Ahmed, Arjovsky and du Mourand", "year": 2017, "type": "paper", "url": null },',
   '{ "title": "Improved Training of Wasserstein GANs", "authors": "Gulrajani, Ahmed, Arjovsky and Bottou", "year": 2017, "type": "paper", "url": null },'],
  ['{ "title": "A Style-Based Generator Architecture for Generative Adversarial Networks", "authors": "Karras, Laine and Lehtinen (Karras et al.)", "year": 2019, "type": "paper", "url": null },',
   '{ "title": "A Style-Based Generator Architecture for Generative Adversarial Networks", "authors": "Karras, Laine and Lehtinen", "year": 2019, "type": "paper", "url": null },'],
  ['{ "title": "Alias-Free Generative Adversarial Networks", "authors": "Karras, Aittala, Laine, Härkönen, Lehtinen and Aila", "year": 2021, "type": "paper", "url": null },',
   '{ "title": "Alias-Free Generative Adversarial Networks", "authors": "Karras, Aittala, Laine, Harkonen, Lehtinen and Aila", "year": 2021, "type": "paper", "url": null },'],
  ['{ "title": "Finite Scalar Quantization: VQ-VAE Made Simple", "authors": "Mentzer, Van de Weerdt, Athanasiou, Taguchi, Nießner and Albicker (Esser group)", "year": 2023, "type": "paper", "url": null },',
   '{ "title": "Finite Scalar Quantization: VQ-VAE Made Simple", "authors": "Mentzer et al.", "year": 2023, "type": "paper", "url": null },'],
  ['{ "title": "Hugging Face diffusers: VQ-VAE / VQGAN autoencoder documentation", "authors": "Hugging Face", "year": 2024, "type": "docs", "url": "https://huggingface.co/docs/diffusers/api/models/autoencoder_tiny" }',
   '{ "title": "Hugging Face diffusers: VQ-VAE and VQGAN model documentation", "authors": "Hugging Face", "year": 2024, "type": "docs", "url": null }'],
  ['{ "title": "PixelCNN: A Class of Autoregressive Models for Image Generation", "authors": "van den Oord, Kalchbrenner and Kavukcuoglu", "year": 2016, "type": "paper", "url": null },',
   '{ "title": "Conditional Image Generation with PixelCNN Decoders", "authors": "van den Oord, Kalchbrenner, Vinyals et al.", "year": 2016, "type": "paper", "url": null },'],
  ['{ "title": " Generative Neural Machine Translation (ByteNet line: Kalchbrenner et al.)", "authors": "Kalchbrenner et al.", "year": 2017, "type": "paper", "url": null },',
   '{ "title": "Neural Machine Translation in Linear Time", "authors": "Kalchbrenner, Vinyals and van den Oord", "year": 2016, "type": "paper", "url": null },'],
  ['{ "title": " Sparse Transformers (Child et al.)", "authors": "Child, Gray, Radford and Sutskever", "year": 2019, "type": "paper", "url": null },',
   '{ "title": "Generating Long Sequences with Sparse Transformers", "authors": "Child, Gray, Radford and Sutskever", "year": 2019, "type": "paper", "url": null },'],
  ['{ "title": "Image GPT (DALL-E line): Zero-Shot Text-to-Image Generation", "authors": "Ramesh et al.", "year": 2021, "type": "paper", "url": null },',
   '{ "title": "Zero-Shot Text-to-Image Generation", "authors": "Ramesh, Pavlov, Goh, Gray, Chen et al.", "year": 2021, "type": "paper", "url": null },'],
  ['{ "title": "Building Normalizing Flows with Stochastic Interpolants", "authors": "Albergo and Vanden-Eijnden", "year": 2022, "type": "paper", "url": null },',
   '{ "title": "Building Normalizing Flows with Stochastic Interpolants", "authors": "Albergo and Vanden-Eijnden", "year": 2022, "type": "paper", "url": null },'],
  ['{ "title": "Discovering the Optimal Trajectory of the Diffusion Model via the Probability Flux (OT-CFM line: Tong et al.)", "authors": "Tong, Fatras, et al.", "year": 2023, "type": "paper", "url": null },',
   '{ "title": "Improving and Generalizing Flow-Based Generative Models with Minibatch Optimal Transport", "authors": "Tong et al.", "year": 2024, "type": "paper", "url": null },'],
  ['{ "title": "Diffusion Models Beat GANs? On the Quality of Discrete Diffusion Language Models (MDLM: Sahoo et al.)", "authors": "Sahoo, Bresson, et al.", "year": 2024, "type": "paper", "url": null },',
   '{ "title": "Simple and Effective Masked Diffusion Language Models", "authors": "Sahoo, Arriola et al.", "year": 2024, "type": "paper", "url": null },'],
  ['{ "title": "Score-Based Generative Modeling through Stochastic Differential Equations (appendices on likelihood and solvers)", "authors": "Song et al.", "year": 2021, "type": "survey", "url": null },', ''],
  ['{ "title": "DPM-Solver: A Fast ODE Solver for Diffusion Probabilistic Models", "authors": "Lu, Zhou, et al.", "year": 2022, "type": "paper", "url": null },',
   '{ "title": "DPM-Solver: A Fast ODE Solver for Diffusion Probabilistic Model Sampling in Around 10 Steps", "authors": "Lu, Zhou, Bao and Zhang", "year": 2022, "type": "paper", "url": null },'],
  ['{ "title": "Elucidating the Design Space of Diffusion-Based Generative Models", "authors": "Karras, Aittala, Lehtinen and Aila", "year": 2023, "type": "paper", "url": null },',
   '{ "title": "Elucidating the Design Space of Diffusion-Based Generative Models", "authors": "Karras, Aittala, Laine and Aila", "year": 2023, "type": "paper", "url": null },'],
  ['{ "title": "Adding Conditional Control / Adversarial Diffusion Distillation (SDXL-Turbo line)", "authors": "Morelle et al. (Sauer et al.)", "year": 2023, "type": "paper", "url": null },',
   '{ "title": "Adversarial Diffusion Distillation", "authors": "Sauer, Lorenz, Ge and Rombach", "year": 2023, "type": "paper", "url": null },'],
  ['{ "title": "Score-Based Generative Modeling through Stochastic Differential Equations", "authors": "Song, Sohl-Dickstein, Kingma, Kumar, Ermon and Poole", "year": 2020, "type": "paper", "url": null },',
   '{ "title": "Score-Based Generative Modeling through Stochastic Differential Equations", "authors": "Song, Sohl-Dickstein, Kingma, Kumar, Ermon and Poole", "year": 2021, "type": "paper", "url": null },'],
  ['{ "title": "Consistency Models", "authors": "Song, Dhariwal, Chen and Sutskever", "year": 2023, "type": "paper", "url": null },',
   '{ "title": "Consistency Models", "authors": "Song, Dhariwal, Chen and Sutskever", "year": 2023, "type": "paper", "url": null },'],
  ['{ "title": "Which Scores Do You Trust? A Study of Evaluation Metrics for Generative Models", "authors": "Jayasumana et al. (or: Borry, B., ...)", "year": 2024, "type": "paper", "url": null },',
   '{ "title": "CLIPScore: A Reference-free Evaluation Metric for Image Captioning", "authors": "Hessel et al.", "year": 2021, "type": "paper", "url": null },'],
  ['{ "title": "Rethinking the Fréchet Distance for Generative Model Evaluation (FD / FID analysis line)", "authors": "Blaschko and others", "year": 2024, "type": "paper", "url": null },', ''],
  ['{ "title": "Prasing the Frechet Distance and its variants for image generation evaluation (torchmetrics/NNI implementations)", "authors": "Kynkaanniemi et al. follow-up implementations", "year": 2023, "type": "docs", "url": null }',
   '{ "title": "torchmetrics: Frechet Inception Distance and related image metrics", "authors": "Lightning AI", "year": 2024, "type": "docs", "url": null }'],
  ['{ "title": "CS236: Deep Generative Models - diffusion lectures", "authors": "Stanford University (Ermon)", "year": 2023, "type": "course", "url": "https://cs236.stanford.edu/" }',
   '{ "title": "CS236: Deep Generative Models", "authors": "Stanford University (Ermon)", "year": 2023, "type": "course", "url": "https://cs236.stanford.edu/" }'],
]);
