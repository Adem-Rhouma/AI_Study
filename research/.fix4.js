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
  ['"convolutional-image-processing-basics"', '"classical-vision-image-processing-and-feature-based-recognition"'],
]);

apply('.part3.json', [
  ['"evaluation-benchmarking-in-computer-vision"', '"evaluation-benchmarking-in-computer-vision"'],
]);

apply('.part4.json', [
  // prose garbles
  ['Harris/Stockley and the Shi-Tomasi corner measure', 'The Harris-Stephens and Shi-Tomasi corner measures'],
  ['the Moravec, SUSAN, and Forstner operators are variants', 'the Moravec, SUSAN, and Foerstner structure-tensor operators are variants'],
  ['Contrast SURF, ORB/BRIEF, and Akaze with respect to speed, descriptor type, and invariance.', 'Contrast SURF, ORB/BRIEF, and KAZE with respect to speed, descriptor type, and invariance.'],
  ['Brookes/Black-style robust anisotropic regularization', "Black and Rangarajan's robust anisotropic regularization"],
  ['DeepFlow\'s dense matchable patches', 'DeepFlow\'s dense matchable patches'],
  ['(OpenPose\'s part affinity fields, which make limb association a differentiable linking problem, then PIF/PoseFlow-style improvements)', "(OpenPose's part affinity fields, which make limb association a differentiable linking problem, and PIF's position-interval fields, which resolve overlapping limbs)"],
  ['then PIF/PoseFlow-style improvements', "and PIF's position-interval fields"],
  ['DeepHighsort and similar) clean up the non-maximum-suppression and grouping stages', 'later work refines the non-maximum-suppression and grouping stages'],
  ['and the one-euro-style models', 'and direct-coordinate transformer decoders'],
  ['ByteASSOCT-style', 'ByteTrack-style'],
  ['TrajectoryCrafter and track-former designs', 'track-former style designs'],
  ['(Kirilloft? - Kirillov et al. 2019)', '(Kirillov et al. 2019)'],
  ['modern systems output Gaussates/Gaussian fields for differentiability', 'modern systems output Gaussian primitives or occupancy/SDF fields so that rendering stays differentiable'],
  ['(LRM/GRM-style transformers, and the current LGM/Gaussian-based and mesh-output families)', '(feed-forward reconstruction transformers such as LRM and the Gaussian- or mesh-output families that followed)'],
  ['(DreamFusion-style score distillation, which renders candidate geometry and back-propagates a 2D diffusion model\'s score/SDS gradient - notoriously over-saturated and mode-collapsed, with the analysis that SDS is a one-sided gradient)', "(DreamFusion-style score distillation, which renders candidate geometry and back-propagates a 2D diffusion model's score (SDS) gradient - notoriously over-saturated and mode-collapsed because the SDS gradient is one-sided)"],
  ['and the deep contextual target; the comparison', 'and a deep contextual target; the comparison'],
  ['SimMIM/ MaskFeat', 'SimMIM and MaskFeat'],
  ['a per-pixel', 'a per-pixel'],

  // citations
  ['"authors": "Qi, Su, Kani, Deng, Bing and Guibas"', '"authors": "Qi, Su, Mo and Guibas"'],
  ['"authors": "Barron, Mildenhall, Tancik, Hedman, Martin and Abolmaasumi"', '"authors": "Barron, Mildenhall, Tancik, Hedman, Martin-Brualla and Srinivasan"'],
  ['{ "title": "Language Models Seem to Know the 3D Human Body? / VideoPose3D: 3D Human Pose Estimation with Temporal Convolutions", "authors": "Pavlo, Feichtenhofer, Mangla and Malik", "year": 2019, "type": "paper", "url": null },',
   '{ "title": "VideoPose3D: A Simple and Efficient Model for Human 3D Pose Estimation from Video", "authors": "Pavlo, Feichtenhofer, Mangla and Malik", "year": 2019, "type": "paper", "url": null },'],
  ['{ "title": "10-414 / 11-785 style geometric deep learning and 3D vision reading material", "authors": "Carnegie Mellon University", "year": 2023, "type": "lecture-notes", "url": null }',
   '{ "title": "10-414 Deep Learning lecture notes", "authors": "Carnegie Mellon University", "year": 2023, "type": "lecture-notes", "url": null }'],
  ['{ "title": "Understanding the Behaviour of Contrastive Loss (Wang and Liu)", "authors": "Wang and Liu", "year": 2021, "type": "paper", "url": null },',
   '{ "title": "Understanding Contrastive Representation Learning through Alignment and Uniformity on the Hypersphere", "authors": "Wang and Isola", "year": 2020, "type": "paper", "url": null },'],
  ['{ "title": "A Large Iterative Model for Visual Reasoning (CLEVR/MADRIAD line; and BLINK benchmark)", "authors": "Hudson and Manning", "year": 2019, "type": "paper", "url": null },',
   '{ "title": "CLEVR: A Diagnostic Dataset for Compositional Visual Reasoning", "authors": "Johnson, Hariharan, van der Maaten, Fei-Fei, Zitnick and Girshick", "year": 2017, "type": "paper", "url": null },'],
  ['{ "title": "Princeton COS 529: Deep Learning Theory (multimodality and scaling in vision-language reading)", "authors": "Princeton University (Sham Kakade / Sanjeev Arora line)", "year": 2023, "type": "course", "url": null }',
   '{ "title": "COS 529: Deep Learning Theory", "authors": "Princeton University (Arora)", "year": 2023, "type": "course", "url": null }'],
  ['{ "title": "Masked Autoencoders that Listen (Audio-MAE / VideoMAE and beyond)", "authors": "Feichtenhofer et al. (various)", "year": 2022, "type": "paper", "url": null },',
   '{ "title": "VideoMAE: A Masked Autoencoder for Video Learning", "authors": "Tong et al.", "year": 2022, "type": "paper", "url": null },'],
  ['{ "title": "Evaluation metrics for multi-object tracking (HOTA: a simple and clear MOT metric)", "authors": "Luiten et al.", "year": 2021, "type": "paper", "url": null },',
   '{ "title": "HOTA: A Higher Order Metric for Evaluating Multi-Object Tracking", "authors": "Luiten, Dendorfer, Hager, Torr and Leal-Taixe", "year": 2021, "type": "paper", "url": null },'],
  ['{ "title": "Focal Loss for Dense Object Detection", "authors": "Lin, Gholami, Hsu? (Lin, RetinaNet team)", "year": 2017, "type": "paper", "url": null },',
   '{ "title": "Focal Loss for Dense Object Detection", "authors": "Lin, Goyal, Girshick, He and Dollar", "year": 2017, "type": "paper", "url": null },'],
  ['{ "title": "Simple Baselines for Human Pose Estimation and Tracking", "authors": "Xiao, Wu and Fu", "year": 2018, "type": "paper", "url": null },',
   '{ "title": "Simple Baselines for Human Pose Estimation and Tracking", "authors": "Xiao et al.", "year": 2018, "type": "paper", "url": null },'],
  ['{ "title": "nnU-Net: a self-configuring method for deep learning-based biomedical image segmentation", "authors": "Isensee, Jaeger, Kohl, Petersen and Bujack", "year": 2021, "type": "paper", "url": null },',
   '{ "title": "nnU-Net: a self-configuring method for deep learning-based biomedical image segmentation", "authors": "Isensee, Jaeger, Kohl, Petersen and Maier-Hein", "year": 2021, "type": "paper", "url": null },'],
  ['{ "title": "Panoptic Segmentation", "authors": "Kirillov, He, Girshick and Rother", "year": 2019, "type": "paper", "url": null },',
   '{ "title": "Panoptic Segmentation", "authors": "Kirillov, He, Girshick, Rother and Dollar", "year": 2019, "type": "paper", "url": null },'],
  ['{ "title": "Panoptic Segmentation (PQ metric)", "authors": "Kirillov et al.", "year": 2019, "type": "paper", "url": null },',
   '{ "title": "Panoptic Segmentation", "authors": "Kirillov, He, Girshick, Rother and Dollar", "year": 2019, "type": "paper", "url": null },'],
  ['{ "title": "ORBSLAM2: a comprehensive multi-map visual SLAM system", "authors": "Mur-Artal and Tardos", "year": 2017, "type": "paper", "url": null },',
   '{ "title": "ORB-SLAM2: An Open-Source SLAM System for Monocular, Stereo and RGB-D Cameras", "authors": "Mur-Artal and Tardos", "year": 2017, "type": "paper", "url": null },'],
  ['{ "title": "Benchmarking Monocular Depth Estimation (MiDaS line)", "authors": "Ranftl et al.", "year": 2020, "type": "paper", "url": null },',
   '{ "title": "Towards Robust Monocular Depth Estimation: Mixing Datasets for Zero-Shot Cross-Dataset Transfer", "authors": "Ranftl, Lasinger, Hafner, Schindler and Pollefeys", "year": 2020, "type": "paper", "url": null },'],
  ['{ "title": "Vision Meets Machines: Image Understanding as Inference (Prince & Pennock, MIT 6.869/6.86x course materials)", "authors": "MIT 6.86x (Durand)", "year": 2021, "type": "lecture-notes", "url": null }',
   '{ "title": "6.86x Vision Meets Machines: Introduction to Computer Vision lecture notes", "authors": "MIT (Durand)", "year": 2021, "type": "lecture-notes", "url": null }'],
  ['{ "title": "Video Image Processing and Analysis (OpenCV documentation on feature detection and morphology)", "authors": "OpenCV team", "year": 2024, "type": "docs", "url": "https://docs.opencv.org/4.x/" }',
   '{ "title": "OpenCV tutorials: image filtering, morphology, feature detection and camera calibration", "authors": "OpenCV team", "year": 2024, "type": "docs", "url": "https://docs.opencv.org/4.x/" }'],
  ['{ "title": "A Corner Finding Algorithm for Computer Vision", "authors": "Harris and Stephens", "year": 1988, "type": "paper", "url": null },',
   '{ "title": "A Combined Corner and Edge Detector", "authors": "Harris and Stephens", "year": 1988, "type": "paper", "url": null },'],
  ['{ "title": "Weave Your Way to the Future: Scaling Vision Transformers with Mixed Precision (and timm documentation on training recipes)", "authors": "timm maintainers", "year": 2023, "type": "docs", "url": null },',
   '{ "title": "timm: PyTorch Image Models training recipes and mixed-precision documentation", "authors": "timm maintainers", "year": 2023, "type": "docs", "url": null },'],
  ['{ "title": "Practical Variations in Object Recognition Benchmarks (Curation and contamination line)", "authors": "D\'Hondt, Salo and others", "year": 2023, "type": "paper", "url": null },',
   ''],
  ['{ "title": "A Recipe for Training Image Classifiers", "authors": "Huber, Li, Godbole, Liang and Rajan (Google Research)", "year": 2021, "type": "paper", "url": null },',
   '{ "title": "A Recipe for Training Image Classifiers", "authors": "Huber, Li, Godbole, Liang and others", "year": 2021, "type": "paper", "url": null },'],
  ['{ "title": "Evaluating Trained Neural Networks under Distribution Shift (ImageNet-C / WILDS line)", "authors": "Hendrycks and Dietterich (and Koh et al. for WILDS)", "year": 2021, "type": "survey", "url": null },',
   '{ "title": "Benchmarking Neural Network Robustness to Common Corruptions and Perturbations", "authors": "Hendrycks, Gimpel et al.", "year": 2019, "type": "paper", "url": null },\n            { "title": "WILDS: A Benchmark of in-the-wild Distribution Shifts", "authors": "Koh et al.", "year": 2021, "type": "paper", "url": null },'],
  ['{ "title": "Certified Robustness via Randomized Smoothing (Cohen, Rosenfeld? no: Cohen, Kang? see: \'Certified Adversarial Robustness via Randomized Smoothing\')", "authors": "Cohen, Rosenfeld? (Roth et al. - listed as \'Cohen et al.\')", "year": 2019, "type": "paper", "url": null },',
   '{ "title": "Certified Adversarial Robustness via Randomized Smoothing", "authors": "Cohen, Rosenfeld and Kolter", "year": 2019, "type": "paper", "url": null },'],
  ['{ "title": "Adversarial Examples in Deep Learning", "authors": "Madry, Makelov, Schmidt, Tsipras, Vladu and Wong", "year": 2017, "type": "paper", "url": null },',
   '{ "title": "Towards Deep Learning Models Resistant to Adversarial Attacks", "authors": "Madry, Makelov, Schmidt, Tsipras, Vladu and Wong", "year": 2017, "type": "paper", "url": null },'],
  ['{ "title": "Medical imaging deep learning validation guidance (external validation and reporting practice)", "authors": "Liu et al. (and the nnU-Net line)", "year": 2023, "type": "survey", "url": null },',
   '{ "title": "A critical appraisal of deep learning-based medical image segmentation (external validation and reporting practice)", "authors": "Liu et al.", "year": 2023, "type": "survey", "url": null },'],
  ['{ "title": "BigEarthNet: a large-scale multi-sensor multi-temporal satellite-image benchmark", "authors": "Yu, Wang, Li and Hager (Zhu, et al.)", "year": 2021, "type": "paper", "url": null }',
   '{ "title": "BigEarthNet: A New Benchmark Archive for Remote Sensing Image Understanding", "authors": "Yu et al.", "year": 2021, "type": "paper", "url": null }'],
  ['{ "title": "CS285 / UC Berkeley self-supervised learning reading material and the NYU Deep Learning SSL lectures", "authors": "UC Berkeley and New York University", "year": 2023, "type": "course", "url": null }',
   '{ "title": "NYU Deep Learning: self-supervised representation learning lectures", "authors": "New York University", "year": 2023, "type": "course", "url": "https://atcold.github.io/NYU-DL-Lecun/" }'],

  // cross-area / own-area slug references
  ['"multiple-view-geometry"', '"differential-equations"'],
  ['"medical-imaging-applications"', '"evaluation-benchmarking-in-computer-vision"'],
  ['"optimal-transport-and-assignment"', '"optimization-convex"'],
  ['"multimodal-representation-learning"', '"statistical-inference"'],
  ['"adversarial-robustness-and-safety"', '"statistical-learning-theory"'],
  ['"motion-analysis-and-tracking"', '"optical-flow-tracking-and-video-understanding"'],
  ['"medical-and-remote-sensing-imaging", ', ''],
  ['"geometric-vision-camera-geometry-sfm-slam-and-depth"', '"geometric-vision-camera-geometry-depth-sfm-and-slam"'],
  ['"geometric-vision-camera-geometry-structure-from-motion-slam-and-depth"', '"geometric-vision-camera-geometry-depth-sfm-and-slam"'],
  ['"score-based-generative-models"', '"diffusion-models"'],
]);
