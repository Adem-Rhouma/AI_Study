const fs = require('fs');
const root = 'C:/Users/rkeks/Documents/project/AI_Study/research/';
const d = JSON.parse(fs.readFileSync(root + '02-deep-learning-generative-vision.json', 'utf8'));
const bad = [];
const ALLOWED = /[\u2010-\u2019\u2026\u00b1\u00d7\u2264\u2265\u2212\u00e9\u00e8\u00fc\u00f6\u00e4\u00df\u00e0\u00e1\u00ed\u00f3\u00fa\u00f1\u00e7\u201c\u201d\u00b0\u00ba\u00b5\u03c0\u03c3\u03bc\u03bb\u03b1\u03b2\u03b8\u03b3\u03b5\u2192\u2194\u2260\u2202\u2207\u2211\u220f\u221e\u2208\u2229\u222a]/g;
function walk(o, path) {
  if (typeof o === 'string') {
    const stripped = o.replace(ALLOWED, '');
    const nm = stripped.match(/[^\x00-\x7F]/g);
    if (nm) bad.push(['NONASCII', path, nm.join('') + ' :: ' + o.slice(0, 160)]);
    const bs = o.match(/\\./g);
    if (bs) bad.push(['BACKSLASH', path, JSON.stringify(bs) + ' :: ' + o.slice(0, 160)]);
    if (/  +/.test(o) && !/```/.test(o)) bad.push(['MULTISPACE', path, o.slice(0, 120)]);
    if (/\bREINSTEIN\b|\bAny-\u6a21|ByteASSOC|Gaussates|Kirilloft|Akaze|Forstner|VampNet|LSTPM|TrajectoryCrafter|one-euro/i.test(o)) bad.push(['GARBLE', path, o.slice(0, 160)]);
    if (/\bTODO|\?\?\?|\bXXX\b/i.test(o)) bad.push(['PLACEHOLDER', path, o.slice(0, 160)]);
  } else if (Array.isArray(o)) o.forEach((v, i) => walk(v, path + '[' + i + ']'));
  else if (o && typeof o === 'object') for (const k in o) walk(o[k], path + '.' + k);
}
walk(d, '');
const kinds = {};
for (const b of bad) kinds[b[0]] = (kinds[b[0]] || 0) + 1;
console.log('counts:', JSON.stringify(kinds));
for (const b of bad.slice(0, 40)) console.log('---', b[0], b[1], '\n', b[2]);
