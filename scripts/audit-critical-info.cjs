// Automated audit of critical information in the repo: secrets/credentials, the API
// surface (server + web client), external hosts, env vars vs .env.example, and
// sensitive files that must not be git-tracked.
//
//   node scripts/audit-critical-info.cjs            human-readable report
//   node scripts/audit-critical-info.cjs --json     also writes audit-report.json
//   node scripts/audit-critical-info.cjs --no-fail  always exit 0
//
// Exit code 1 when any CRITICAL finding exists (so it can gate CI / pre-commit).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const WRITE_JSON = process.argv.includes('--json');
const FAIL_ON_CRIT = !process.argv.includes('--no-fail');
const REPORT = path.join(ROOT, 'audit-report.json');

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.vite']);
const SKIP_FILES = new Set(['package-lock.json', 'audit-report.json', 'audit-critical-info.cjs']);
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.json', '.md', '.html', '.css', '.yml', '.yaml', '.toml']);
const SENSITIVE_FILE_RE = /^(?:\.env(?:\.|$)|.*\.env$|.*app\.key$|.*id_rsa.*$|.*credentials\.json$)|\.(?:pem|key|p12|pfx)$/;

const findings = [];

function add(severity, category, file, line, message) {
  findings.push({ severity, category, file: file ? path.relative(ROOT, file).replace(/\\/g, '/') : null, line: line ?? null, message });
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(p, out);
      continue;
    }
    if (SKIP_FILES.has(entry.name)) continue;
    const ext = path.extname(entry.name);
    if (CODE_EXT.has(ext) || SENSITIVE_FILE_RE.test(entry.name)) out.push(p);
  }
  return out;
}

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

function entropy(str) {
  const counts = new Map();
  for (const ch of str) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  for (const c of counts.values()) { const p = c / str.length; h -= p * Math.log2(p); }
  return h;
}

// ---------------------------------------------------------------------------
// 1. Secrets & credentials. .env files are skipped here on purpose: their mere
//    existence is reported separately, so listing every variable twice is noise.
// ---------------------------------------------------------------------------

const PLACEHOLDER_VALUES = /^($|\$\{|\*{3}|-{6}|x{6,}|null|none|undefined|true|false|change(?:me|it)?$)/i;

const TOKEN_PATTERNS = [
  { re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/, label: 'embedded private key block' },
  { re: /AKIA[0-9A-Z]{16}/, label: 'AWS access key id' },
  { re: /gh[pousr]_[A-Za-z0-9]{30,}/, label: 'GitHub token' },
  { re: /sk-ant-[A-Za-z0-9-]{20,}/, label: 'Anthropic API key' },
  { re: /sk-proj-[A-Za-z0-9-]{20,}/, label: 'OpenAI project key' },
  { re: /\bsk-[A-Za-z0-9]{30,}\b/, label: 'secret key literal (sk-…)' },
  { re: /AIza[0-9A-Za-z_-]{35}/, label: 'Google API key' },
  { re: /xox[bpars]-[A-Za-z0-9-]{20,}/, label: 'Slack token' },
  { re: /glpat-[A-Za-z0-9_-]{20,}/, label: 'GitLab PAT' },
  { re: /SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{32,}/, label: 'SendGrid key' },
  { re: /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{5,}/, label: 'JWT literal' },
  { re: /hooks\.slack\.com\/services\/T[A-Za-z0-9/]+/, label: 'Slack webhook URL' }
];

const ASSIGN_RE = /["']?\b(password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|client[_-]?secret|private[_-]?key|auth[_-]?token)["']?\s*[:=]\s*["']([^"'\n]{6,})["']/gi;
const URL_CREDS_RE = /\b[a-z][a-z0-9+.-]*:\/\/[^'"\s]*:[^'"\s@]{6,}@/gi;

function scanSecrets(files) {
  const seenEntropy = new Map();
  for (const file of files) {
    if (/(^|[/\\])\.env/.test(path.basename(file))) continue;
    const isCode = ['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.py'].includes(path.extname(file));
    const src = fs.readFileSync(file, 'utf8');

    for (const { re, label } of TOKEN_PATTERNS) {
      for (const m of src.matchAll(new RegExp(re.source, 'gi'))) {
        add('crit', 'secret', file, lineOf(src, m.index), `looks like ${label}`);
      }
    }

    for (const m of src.matchAll(URL_CREDS_RE)) {
      add('crit', 'secret', file, lineOf(src, m.index), `credentials embedded in a URL (${m[0].split('://')[0]}://…)`);
    }

    const isTest = /\.(test|spec)\.[tj]sx?$/.test(path.basename(file));
    for (const m of src.matchAll(ASSIGN_RE)) {
      const value = m[2];
      // skip natural-language strings and code fragments; a real credential is
      // digit-bearing (or at least punctuation-only) with no prose/punctuation syntax
      if (
        PLACEHOLDER_VALUES.test(value) ||
        value.includes('process.') ||
        /^\d+$/.test(value) ||
        /[();{}[\]]/.test(value) ||
        (/\s/.test(value) && !/\d/.test(value))
      ) continue;
      add(isTest ? 'warn' : 'crit', 'secret', file, lineOf(src, m.index), `hardcoded "${m[1]}" → ${value.slice(0, 6)}••`);
    }

    // env('APP_SECRET', 'literal') — sensitive env vars with hardcoded defaults
    for (const m of src.matchAll(/\benv\(\s*['"]([A-Z_]*(?:SECRET|PASSWORD|KEY|TOKEN)[A-Z_]*)['"]\s*,\s*['"]([^'"]{6,})['"]\s*\)/gi)) {
      if (PLACEHOLDER_VALUES.test(m[2])) continue;
      add('warn', 'secret', file, lineOf(src, m.index), `sensitive env var ${m[1]} has a hardcoded default (${m[2].slice(0, 4)}••)`);
    }

    if (isCode) {
      for (const m of src.matchAll(/[A-Za-z0-9_/+=-]{32,}/g)) {
        const v = m[0];
        const rec = seenEntropy.get(v);
        if (rec) { rec.count++; continue; }
        // not plausible secrets: file paths (drive-letter or known extensions), imports
        const line = src.slice(src.lastIndexOf('\n', m.index) + 1, m.index + v.length + 1);
        const lineIsPath = /[a-z]{1,2}:[/\\]/i.test(line);
        const filePathish = lineIsPath || /\.(json|ts|tsx|js|mjs|cjs|md|html|css|svg|png|jpe?g|woff2?|txt|yaml|yml|key|sqlite)$/i.test(v);
        const plausible = !filePathish && /[A-Z]/.test(v) && /\d/.test(v) && entropy(v) >= 4.0;
        seenEntropy.set(v, { count: 1, plausible });
        if (plausible) add('warn', 'secret', file, lineOf(src, m.index), `high-entropy constant worth reviewing (${v.length} chars)`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 2. API surface inventory
// ---------------------------------------------------------------------------

function scanApiSurface(files) {
  const mounts = [];       // { var, path }   from  api.use('/auth', authRouter)
  const serverRoutes = []; // { receiver, method, path, file, line }
  const clientCalls = [];  // { method, path, file, line }

  for (const file of files) {
    if (!['.ts', '.tsx'].includes(path.extname(file))) continue;
    const rel = relPath(file);
    const src = fs.readFileSync(file, 'utf8');

    if (rel.startsWith('server/')) {
      for (const m of src.matchAll(/\bapi\.use\(\s*['"]([^'"]+)['"]\s*,\s*(\w+Router)/g)) {
        mounts.push({ var: m[2], path: m[1], file: relPath(file), line: lineOf(src, m.index) });
      }
      for (const m of src.matchAll(/\b(api|\w*Router)\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g)) {
        serverRoutes.push({ receiver: m[1], method: m[2].toUpperCase(), path: m[3], file: relPath(file), line: lineOf(src, m.index) });
      }
    }

    if (rel.startsWith('web/') && !rel.includes('.test.')) {
      for (const m of src.matchAll(/\bapi\s*\.\s*(get|post|put|patch|del)\s*(?:<[\s\S]{0,150}?>\s*)?\(\s*([`'"])([^`'"]+)\2/g)) {
        clientCalls.push({ method: m[1].toUpperCase(), path: m[3].replace(/\$\{[^}]*\}/g, '{…}'), file: relPath(file), line: lineOf(src, m.index) });
      }
    }
  }

  // stores.ts mounts + the app.use('/api', api) root
  const mountByVar = new Map([['api', '']]);
  for (const m of mounts) mountByVar.set(m.var, m.path);
  return { mounts, serverRoutes, clientCalls, mountByVar };
}

// ---------------------------------------------------------------------------
// 3. External hosts referenced anywhere
// ---------------------------------------------------------------------------

const NON_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', 'example.com', 'w3.org', 'vite.dev', 'vitest.dev', 'nixos.org']);

function scanExternalHosts(files) {
  const hosts = new Map(); // host -> { count, files: [] }
  for (const file of files) {
    if (!['.md', '.json', '.ts', '.tsx'].includes(path.extname(file))) continue;
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) {
      const host = m[1].toLowerCase().replace(/^www\./, '');
      if (NON_HOSTS.has(host)) continue;
      const rec = hosts.get(host) ?? { count: 0, files: [] };
      rec.count++;
      if (rec.files.length < 4 && !rec.files.includes(relPath(file))) rec.files.push(relPath(file));
      hosts.set(host, rec);
    }
  }
  return hosts;
}

// ---------------------------------------------------------------------------
// 4. Env vars used vs documented in .env.example
// ---------------------------------------------------------------------------

function scanEnvVars(files) {
  const used = new Map(); // NAME -> ['file:line', …]
  for (const file of files) {
    if (file.endsWith('audit-critical-info.cjs')) continue;
    const src = fs.readFileSync(file, 'utf8');
    const record = (name, index) => {
      if (!used.has(name)) used.set(name, []);
      used.get(name).push(`${relPath(file)}:${lineOf(src, index)}`);
    };
    for (const m of src.matchAll(/env\(\s*['"]([A-Z][A-Z0-9_]+)['"]/g)) record(m[1], m.index);
    for (const m of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) record(m[1], m.index);
    for (const m of src.matchAll(/import\.meta\.env\.([A-Z][A-Z0-9_]+)/g)) record(m[1], m.index);
  }

  const example = [path.join(ROOT, '.env.example'), path.join(ROOT, 'server', '.env.example')].find(fs.existsSync);
  let documented = null;
  if (example) {
    documented = new Set(
      fs.readFileSync(example, 'utf8')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#') && /^[A-Z][A-Z0-9_]*=/.test(l))
        .map(l => l.split('=')[0])
    );
  }
  return { used, documented, exampleFile: example ? relPath(example) : null };
}

// ---------------------------------------------------------------------------
// 5. Sensitive files on disk — git-tracked is critical, ignored is fine
// ---------------------------------------------------------------------------

function gitList() {
  try {
    return new Set(execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').map(l => l.trim()).filter(Boolean));
  } catch {
    return null;
  }
}

function scanSensitiveFiles(files) {
  const tracked = gitList();
  const local = files.filter(f => SENSITIVE_FILE_RE.test(path.basename(f)) && !f.includes('node_modules'));

  for (const abs of local) {
    const rel = relPath(abs);
    const isTracked = tracked ? tracked.has(rel) : null;
    let ignored = null;
    if (tracked) {
      try { execFileSync('git', ['check-ignore', '-q', rel], { cwd: ROOT, stdio: 'ignore' }); ignored = true; } catch { ignored = false; }
    }
    const verdict = isTracked ? '!!! TRACKED BY GIT' : ignored ? 'ignored by git ✓' : 'untracked';
    add(isTracked ? 'crit' : 'info', 'files', abs, null, `secret-named file exists locally (${rel}) — ${verdict}`);
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function relPath(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function main() {
  const t0 = Date.now();
  const files = walk(ROOT);
  void relPath;

  scanSecrets(files);
  const api = scanApiSurface(files);
  const hosts = scanExternalHosts(files);
  const env = scanEnvVars(files);
  scanSensitiveFiles(files);

  const crit = findings.filter(f => f.severity === 'crit');
  const warn = findings.filter(f => f.severity === 'warn');
  const info = findings.filter(f => f.severity === 'info');

  console.log(`\naudit-critical-info — scanned ${files.length} files in ${Date.now() - t0}ms\n`);

  console.log(`== CRITICAL FINDINGS (${crit.length}) ==`);
  for (const f of crit) console.log(`  [${f.category}] ${f.file}:${f.line ?? '-'} — ${f.message}`);
  if (!crit.length) console.log('  none');

  console.log(`\n== WARNINGS (${warn.length}) ==`);
  for (const f of warn) console.log(`  ${f.file}:${f.line ?? '-'} — ${f.message}`);
  if (!warn.length) console.log('  none');

  console.log('\n== ENV CONFIG ==');
  if (!env.exampleFile) {
    console.log(`  ! no .env.example found, but ${env.used.size} env vars are referenced in code:`);
    for (const [name, locs] of env.used) console.log(`    ${name}  (${locs[0]}${locs.length > 1 ? ` +${locs.length - 1} more` : ''})`);
  } else {
    const names = new Set(env.used.keys());
    const undocumented = [...names].filter(n => !env.documented.has(n));
    const unused = [...env.documented].filter(n => !names.has(n));
    console.log(`  documented in ${env.exampleFile}: ${env.documented.size}, referenced in code: ${names.size}`);
    if (undocumented.length) console.log(`  ! referenced in code but not documented: ${undocumented.join(', ')}`);
    if (unused.length) console.log(`  ! documented but never referenced: ${unused.join(', ')}`);
    if (!undocumented.length && !unused.length) console.log('  in sync');
  }

  console.log('\n== SERVER API SURFACE ==');
  console.log(`  router mounts: ${api.mounts.map(m => `${m.path}→${m.var}`).join(', ') || 'none'}`);
  const endpoints = api.serverRoutes
    .map(r => ({
      method: r.method,
      path: '/api' + (api.mountByVar.get(r.receiver) ?? '/') + r.path,
      file: r.file, line: r.line
    }))
    .sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
  console.log(`  endpoints (${endpoints.length}):`);
  for (const e of endpoints) console.log(`    ${e.method.padEnd(6)} ${e.path}  (${e.file})`);

  const uniqueCalls = [...new Map(api.clientCalls.map(c => [`${c.method} ${c.path}`, c])).values()]
    .sort((a, b) => a.path.localeCompare(b.path));
  console.log(`  web client calls (${uniqueCalls.length}):`);
  for (const c of uniqueCalls) console.log(`    ${c.method.padEnd(6)} /api/${c.path.replace(/^\//, '')}  (${c.file})`);

  console.log('\n== EXTERNAL HOSTS ==');
  const sortedHosts = [...hosts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [host, rec] of sortedHosts) console.log(`  ${host} — ${rec.count} ref(s), e.g. ${rec.files.join(', ')}`);
  if (!sortedHosts.length) console.log('  (none)');

  console.log(`\n== FILES (${info.length}) ==`);
  for (const f of info) console.log(`  ${f.file} — ${f.message}`);

  console.log(`\nsummary: ${crit.length} critical / ${warn.length} warnings / ${info.length} info`);
  if (crit.length) console.log('RESULT: FAIL — critical findings present');

  if (WRITE_JSON) {
    fs.writeFileSync(REPORT, JSON.stringify({
      generatedAt: new Date().toISOString(),
      scannedFiles: files.length,
      counts: { critical: crit.length, warnings: warn.length, info: info.length },
      findings: [...crit, ...warn, ...info],
      api: { mounts: api.mounts, endpoints, clientCalls: uniqueCalls },
      externalHosts: Object.fromEntries(sortedHosts.map(([h, r]) => [h, { count: r.count, files: r.files }])),
      env: { used: Object.fromEntries([...env.used].map(([k, v]) => [k, v])), documented: env.documented ? [...env.documented] : null }
    }, null, 2));
    console.log(`machine report: ${path.relative(ROOT, REPORT).replace(/\\/g, '/')}`);
  }

  process.exitCode = crit.length && FAIL_ON_CRIT ? 1 : 0;
}

main();
