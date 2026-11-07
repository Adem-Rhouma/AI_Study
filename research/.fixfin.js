const fs = require('fs');
const p = 'C:/Users/rkeks/Documents/project/AI_Study/research/.finalize.js';
let s = fs.readFileSync(p, 'utf8');
const before = s.length;
s = s.replace(/([A-Za-z0-9])'([A-Za-z])/g, "$1\\'$2");
fs.writeFileSync(p, s);
console.log('patched', before, '->', s.length);
