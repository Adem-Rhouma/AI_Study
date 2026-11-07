# AGENTS.md — AI Mastery

Express 5 + SQLite API and React/Vite SPA in an npm-workspaces monorepo (`server/`, `web/`).
Dev machine is Windows; shell examples are PowerShell.

## Binding docs — read before editing

- `docs/PROJECT_OVERVIEW.md`, `docs/ARCHITECTURE.md`, `docs/FEATURES.md`, `docs/DEVELOPMENT.md`
  are the project knowledge base: what the product is, how the system fits together, where each
  feature lives, and how to run/verify. Start there; this file only keeps the sharpest edges.
- `docs/CONVENTIONS.md` is **binding, not advisory**: server layering, ESM import rules, SQL
  binding rules, auth rules, test harness usage, frontend token/styling rules. Key traps from it:
  - Relative imports in `server/` must end in `.js` (TypeScript NodeNext ESM).
  - `src/routes.ts`, `src/app.ts`, `src/config.ts`, `src/db/*`, `src/lib/*`, `docs/*` are owned
    by the project lead. Module work stays in `src/modules/<feature>/`
    (`*.routes.ts` → `*.service.ts` → `*.repo.ts`; SQL only in `*.repo.ts` via `src/db/sql.ts` helpers).
  - Never read a user id from request body/query — only `req.user.id` (session).
- `research/RESEARCH_CONTRACT.md` defines the strict JSON schema and citation-integrity rules for
  curriculum research files. Never fabricate titles/authors/URLs there.
- `docs/adr/0003-mastery-model.md` defines the mastery score; change progress/scoring code only
  in line with it. (Note: `docs/CONVENTIONS.md` cites `docs/adr/0004-json-columns.md`, which does
  not exist yet.)

## Commands (from repo root unless noted)

```powershell
npm install
npm run dev                 # server + web together (concurrently), or dev:server / dev:web
npm run typecheck           # both workspaces (tsc --noEmit)
npm test                    # server then web
npm run audit               # secrets/API-surface audit; exits 1 on CRITICAL findings
```

Single focused test:

```powershell
cd server; npx vitest run tests/<area>.test.ts    # e.g. tests/auth.test.ts
cd web;    npx vitest run src/pages/SettingsPage.test.tsx
npx tsc --noEmit -p tsconfig.test.json            # from server/ — tests have their own tsconfig
```

`tsconfig` runs with `noUnusedLocals`/`noUnusedParameters` — an unused local fails the build.

## Database & content pipeline

```powershell
npm run db:migrate; npm run db:seed      # first run; better-sqlite3, no ORM
npm run curriculum:build                 # research/*.json -> server/data/curriculum/*.json
npm run db:reset                         # DESTRUCTIVE: drops data, re-migrates, re-seeds
```

Order matters for curriculum changes: edit only `research/*.json` (source of truth), run
`curriculum:build`, then re-seed. `server/data/curriculum/` is generated and gitignored — never
hand-edit it. Hand-authored seed content lives in `server/data/content/` (tracked). The build step
silently drops topics/citations that fail validation and prints the report — read it.

## Runtime & environment quirks

- **No dotenv.** Config comes from real env vars only (`server/src/config.ts`): set `$env:PORT`,
  `$env:WEB_ORIGIN`, etc. in the shell before starting. Defaults: API `:4000`, web `:5173`
  (Vite `strictPort`). The README's `192.168.1.15` URLs are the lead's LAN IP — substitute your own.
- `npm run dev:web` binds localhost only; for LAN access run `npx vite --host 0.0.0.0 --port 5173`.
  Vite proxies `/api` and `/uploads` to `API_ORIGIN` (default `http://localhost:4000`).
- Without `APP_SECRET`, the server auto-generates and persists `server/data/app.key` — deleting it
  makes stored (encrypted) provider API keys unreadable and sessions invalid.
- The server serves `web/dist` if it exists, so a stale built SPA can shadow the dev server.
- AI provider config: DB provider rows (admin UI) take precedence; env fallback is
  `AI_PROVIDER`/`AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL`. Seeded admin: `admin@aimastery.local` /
  `ChangeMe-2026!` (override with `SEED_ADMIN_*`).

## Known broken (verified 2026-11)

`npm run build` fails in `server/`: its script calls `tsc -p tsconfig.build.json` but that file
does not exist. Interim workaround: `cd server; npx tsc -p tsconfig.json` (it already compiles
only `src/` to `dist/`, so `npm run start` works afterwards). Creating a proper
`tsconfig.build.json` is a change to shared/lead-owned config — coordinate first.

## Tests

- Every server test uses the harness in `server/tests/helpers.ts` (`freshDb()` gives an isolated
  in-memory DB with migrations applied; `registerUser`, `makeStaff`, `authHeader`, fixtures).
  Never touch `server/data/*.sqlite` from tests and never start the dev server for them —
  vitest runs `pool: 'forks'`, `singleFork`, sequentially, with 30s timeouts.
- Web tests are colocated (`src/**/*.test.tsx`), run in jsdom with `src/test/setup.ts`.
- Security scanners (run manually, not wired to a script): `npm run audit` at root, and
  `node server/scripts/scan-unbound-sql.cjs` flags db calls with named params but no bind object.
