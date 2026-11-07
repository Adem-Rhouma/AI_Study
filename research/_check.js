const fs = require('fs');
const file = process.argv[2];
let s = fs.readFileSync(file, 'utf8');
if (s.endsWith('##END##')) s = s.slice(0, s.lastIndexOf('##END##'));
let depth = 0, inStr = false, esc = false;
const events = [];
for (let i = 0; i < s.length; i++) {
  const c = s[i];
  if (inStr) {
    if (esc) esc = false;
    else if (c === '\\') esc = true;
    else if (c === '"') inStr = false;
    continue;
  }
  if (c === '"') { inStr = true; continue; }
  if (c === '{' || c === '[') { depth++; continue; }
  if (c === '}' || c === ']') {
    depth--;
    if (depth === 0) events.push(i);
    else if (depth < 0) { events.push('UNDERFLOW@' + i); depth = 0; }
  }
}
console.log(file, 'len', s.length, 'root closes at', events.slice(0, 5).join(','));
try {
  const j = JSON.parse(s);
  let n = 0;
  const names = [];
  for (const d of j.domains || []) { names.push(d.name); for (const sd of d.subdomains || []) n += (sd.topics || []).length; }
  console.log('PARSED after sentinel strip. domains=' + (j.domains || []).length + ' topics=' + n);
  console.log(names.join(' | '));
} catch (e) {
  console.log('still invalid:', e.message.slice(0, 160));
}
