const fs = require('fs');
const path = require('path');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

// A db call whose SQL text is the final argument, i.e. no params object was passed.
const callRe = /(?:all|get|run|insert)\s*(?:<[^>]*>)?\s*\(\s*db\s*,\s*(`[^`]*`|'[^']*'|"[^"]*")\s*\)/g;
let hits = 0;
for (const file of walk(process.env.SCAN_DIR ?? path.join(__dirname, '..', 'src'))) {
  const src = fs.readFileSync(file, 'utf8');
  for (const match of src.matchAll(callRe)) {
    const sql = match[1];
    if (!/@[a-zA-Z_]/.test(sql)) continue;
    const line = src.slice(0, match.index).split('\n').length;
    console.log(`${file}:${line} -> ${sql.replace(/\s+/g, ' ').slice(0, 90)}`);
    hits += 1;
  }
}
console.log(`unbound named-parameter calls: ${hits}`);
