const fs = require('fs');
const p = 'C:/Users/rkeks/Documents/project/AI_Study/research/02-deep-learning-generative-vision.json';
let s = fs.readFileSync(p, 'utf8');
const reps = [
  [
    'spiking/capsule/liquid plus memory-augmented/DNC plus world-model architectures two topics, autoregressive',
    'spiking/capsule/liquid plus memory-augmented/DNC/world-model architectures collapsed into one specialized-and-world-model-architectures topic, optical flow plus multi-object tracking plus human pose and body reconstruction plus video understanding collapsed into one motion-pose-and-video-understanding topic (pose therefore has no standalone topic), autoregressive'
  ],
];
for (const [a, b] of reps) {
  if (!s.includes(a)) { console.log('MISS:', a.slice(0, 60)); continue; }
  s = s.split(a).join(b);
  console.log('ok');
}
const doc = JSON.parse(s);
console.log('notes length:', doc.notes_on_gaps.length);
fs.writeFileSync(p, s);
