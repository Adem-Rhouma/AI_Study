/* Repairs research JSON that agents wrote with unescaped double quotes inside string values,
   then re-serialises it so the file is machine-valid. Refuses to run when the result is not parseable. */
const fs = require('fs');

function repair(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c !== '"') {
      out += c;
      i++;
      continue;
    }
    // Start of a string: copy it, escaping any quote that is not a real terminator.
    out += '"';
    i++;
    while (i < n) {
      const ch = src[i];
      if (ch === '\\') {
        out += ch;
        if (i + 1 < n) {
          out += src[i + 1];
          i += 2;
        } else i++;
        continue;
      }
      if (ch === '"') {
        // Look ahead: a terminator is followed (after whitespace) by , } ] : or end of input.
        let j = i + 1;
        while (j < n && (src[j] === ' ' || src[j] === '\t' || src[j] === '\n' || src[j] === '\r')) j++;
        const next = src[j];
        if (j >= n || next === ',' || next === '}' || next === ']' || next === ':') {
          out += '"';
          i++;
          break;
        }
        out += '\\"';
        i++;
        continue;
      }
      if (ch === '\n') {
        // A raw newline inside a string would have closed parsing earlier; keep it escaped.
        out += ' ';
        i++;
        continue;
      }
      out += ch;
      i++;
    }
  }
  return out;
}

const file = process.argv[2];
let src = fs.readFileSync(file, 'utf8');
const sentinel = src.indexOf('##END##');
if (sentinel !== -1) src = src.slice(0, sentinel);

let parsed;
try {
  parsed = JSON.parse(src);
  console.log(file + ' already valid');
} catch (firstError) {
  const fixed = repair(src);
  try {
    parsed = JSON.parse(fixed);
  } catch (secondError) {
    console.log(file + ' UNREPAIRABLE: ' + secondError.message.slice(0, 160));
    process.exit(1);
  }
  fs.writeFileSync(file + '.before-repair', src);
  fs.writeFileSync(file, JSON.stringify(parsed, null, 2) + '\n');
  console.log(file + ' repaired and rewritten');
}

let topics = 0;
const names = [];
for (const d of parsed.domains || []) {
  names.push(d.name + ' [' + (d.subdomains || []).length + ' subdomains]');
  for (const sd of d.subdomains || []) topics += (sd.topics || []).length;
}
console.log('  domains=' + (parsed.domains || []).length + ' topics=' + topics);
console.log('  ' + names.join('\n  '));
