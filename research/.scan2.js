const fs = require('fs');
const root = 'C:/Users/rkeks/Documents/project/AI_Study/research/';
const d = JSON.parse(fs.readFileSync(root + '02-deep-learning-generative-vision.json', 'utf8'));
const RE = /\bREINSTEIN\b|Any-[^\s]*|ByteASSOC\w*|Gaussates|Kirilloft\w*|\bAkaze\b|Forstner|VampNet|LSTPM|TrajectoryCrafter|one-euro\S*|Bach\?|PIDYat\w*/gi;
function walk(o, path) {
  if (typeof o === 'string') {
    let m;
    RE.lastIndex = 0;
    while ((m = RE.exec(o))) {
      const s = Math.max(0, m.index - 130), e = Math.min(o.length, m.index + 130);
      console.log('###', path, '::', JSON.stringify(o.slice(s, e)));
    }
  } else if (Array.isArray(o)) o.forEach((v, i) => walk(v, path + '[' + i + ']'));
  else if (o && typeof o === 'object') for (const k in o) walk(o[k], path + '.' + k);
}
walk(d, '');
