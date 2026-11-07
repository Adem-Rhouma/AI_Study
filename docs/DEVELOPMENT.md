# Development

Practical guide for working on AI Mastery. Setup/run basics (ports, LAN access, production
build) are in the [README](../README.md) — this page covers everything around them: the
environment, the test harness, the content pipeline, and how to start making changes.

Binding rules live in [AGENTS.md](../AGENTS.md) (short) and [CONVENTIONS.md](CONVENTIONS.md)
(detailed). Read both before editing.

## Setup

```powershell
# Windows PowerShell; Node >= 20.11
npm install
npm run db:migrate      # create + migrate server/data/ai-mastery.sqlite
npm run db:seed         # load curriculum + hand-authored content, create admin + demo user
npm run dev             # API on :4000 and Vite on :5173 together (concurrently)
```

Seeded sign-ins (override the admin with `SEED_ADMIN_*`):

| Role | Email | Password |
|---|---|---|
| Admin | `admin@aimastery.local` | `ChangeMe-2026!` |
| Demo learner | `learner@aimastery.local` | `Learn-2026-demo` |

## Environment

There is **no dotenv**: config comes from real environment variables only
([server/src/config.ts](../server/src/config.ts)). Defaults are sensible for local dev
(API `:4000`, web `:5173`), so an empty environment works.

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `4000` | API port |
| `NODE_ENV` | `development` | `production` enables secure cookies + stricter CSP |
| `WEB_ORIGIN` | `http://localhost:5173` | CORS origin for dev; README's LAN examples use `http://<lan-ip>:5173` |
| `DATA_DIR` / `DB_PATH` | `server/data` / `server/data/ai-mastery.sqlite` | SQLite file lives here (WAL) |
| `UPLOAD_DIR` | `server/data/uploads` | served statically at `/uploads` |
| `CURRICULUM_DIR` | `server/data/curriculum` | generated files consumed by the seeder |
| `APP_SECRET` | auto-generated → `server/data/app.key` | derives the AES key for provider API keys; **deleting the file invalidates stored keys and sessions** |
| `SESSION_LIFETIME_DAYS`, `COOKIE_NAME`, `COOKIE_SECURE` | `30`, `aim_session`, `false` | session cookie |
| `RATE_LIMIT_AUTH` / `_AI` / `_GENERAL` | `20` / `20` / `240` | per minute, in-memory |
| `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | empty | env fallback when no admin provider row is enabled (`openai_compatible` \| `anthropic` \| `ollama`) |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | see table above | only affects seeding |
| `LOG_LEVEL` | `info` | |

Vite reads `API_ORIGIN` (default `http://localhost:4000`) for the `/api` + `/uploads` proxy.

Quirks worth knowing:

- The API serves `web/dist` if it exists — a stale production build will shadow the Vite dev
  server on the same origin. `rm -r web/dist` if pages look outdated.
- Database changes need a restart when done via CLI while `tsx watch` is running.

## Content pipeline

```powershell
npm run curriculum:build   # research/*.json -> server/data/curriculum/*.json (prints a drop report — read it)
npm run db:seed            # upsert curriculum + server/data/content/** into SQLite (idempotent)
npm run db:reset           # DESTRUCTIVE: drop, re-migrate, re-seed
```

Order matters: edit only `research/*.json` (source of truth) or `server/data/content/**`
(hand-authored courses/paths/exercises/resources/collections — git-tracked), then build, then
seed. `server/data/curriculum/**` is generated and gitignored — never hand-edit it. Citation
rows dedupe by normalised URL, so changing a URL creates a new row; `db:reset` is the reliable
way to make citation edits stick.

## Tests

```powershell
npm test                   # both workspaces

# focused
cd server; npx vitest run tests/curriculum.test.ts
cd web;    npx vitest run src/pages/SettingsPage.test.tsx
npx tsc --noEmit -p tsconfig.test.json   # from server/ — tests have their own tsconfig
npm run typecheck          # tsc --noEmit in both workspaces
```

- Server tests never touch `server/data/*.sqlite` and never start the dev server.
  [server/tests/helpers.ts](../server/tests/helpers.ts) provides `freshDb()` (in-memory DB with
  migrations applied), `makeApp(db)`, `registerUser`, `makeStaff`, `authHeader` and content
  fixtures. Vitest runs sequentially (`pool: 'forks'`, `singleFork`, 30 s timeouts).
- Web tests are colocated (`src/**/*.test.tsx`), jsdom, with observer/matchMedia stubs in
  [web/src/test/setup.ts](../web/src/test/setup.ts); `fetch` is stubbed per test and any
  un-stubbed request throws.
- Assertions on errors must target `body.error.details[0]...` — the envelope's top-level
  `message` is intentionally generic.

## Repository map

```
research/                  # literature survey (source of truth) + research contract + UX research
  RESEARCH_CONTRACT.md     # strict JSON schema + citation-integrity rules for research files
  10-product-ux-research.md# competitive/UX evidence behind product decisions
server/
  src/
    index.ts app.ts routes.ts config.ts     # bootstrap, middleware chain, route registry, env
    lib/                   # http (handler, ApiError), crypto, auth-context, domain schemas, rateLimit
    db/                    # connection (WAL, FKs), sql helpers, checksummed migrations, cli
    seed/                  # seeder + zod schemas for every content file
    curriculum/            # research -> curriculum build (validation + drop report)
    modules/<feature>/     # *.routes.ts -> *.service.ts -> *.repo.ts (SQL only in repos)
  tests/                   # vitest, in-memory DB harness
  data/
    content/               # hand-authored seed content (git-tracked)
    curriculum/            # generated (gitignored)
    ai-mastery.sqlite      # the database (gitignored)
web/
  src/
    App.tsx                # routes (lazy pages), auth gates, preference sync
    api/                   # client.ts (only fetch caller), keys.ts (query keys), types.ts
    pages/                 # one file per route
    components/
      content/             # block renderer, math/code/markdown, interactives
      explore/             # prerequisite map
      admin/               # Content Studio panels (descriptor-driven)
      ui/                  # design-system primitives (Card, Field, Chip, Feedback…)
    lib/                   # session, theme, format, cn
    styles/                # Tailwind 4 CSS-first tokens (tokens.css), base, prose
scripts/
  audit-critical-info.cjs  # `npm run audit`: secrets/API-surface audit, exits 1 on CRITICAL
```

There is also `server/scripts/scan-unbound-sql.cjs` — flags SQL calls that use named parameters
without a bindings object (a class of bug no type check catches). Run it after writing repo SQL.

## Starting a change

1. **Read the rules**: [CONVENTIONS.md](CONVENTIONS.md) — layering (routes → service → repo),
   `.js` import suffixes, named SQL binds only, never read a user id from body/query.
2. **Find the feature's home** in [FEATURES.md](FEATURES.md); changes stay inside
   `server/src/modules/<feature>/` (plus a route file you may extend) and the matching web page.
   `src/routes.ts`, `src/app.ts`, `src/config.ts`, `src/db/*`, `src/lib/*` are shared/lead-owned.
3. Common recipes:
   - *New API field on a learner payload*: add to the repo's SELECT + mapper, the type in
     `web/src/api/types.ts`, then the page. Verify with `curl` before the UI.
   - *New content kind/field in the studio*: extend the descriptor in
     [admin.kinds.ts](../server/src/modules/admin/admin.kinds.ts) — the UI renders from
     `GET /admin/kinds`; add integrity checks via `kind.check` if publishability depends on it.
   - *New lesson block type*: extend `blockTypes` in
     [server/src/lib/domain.ts](../server/src/lib/domain.ts), seed schema, and
     [BlockRenderer.tsx](../web/src/components/content/BlockRenderer.tsx).
   - *Schema change*: **new migration file** in `server/src/db/migrations/` (never edit an
     applied one — they are checksummed).
4. **Verify like the docs matter**: run `npm run typecheck`, the focused test, then
   `npm test`; exercise the change in the browser (dev servers) rather than trusting a green
   suite. The studio displays numbers the learner API must agree with — cross-check both.

## Known issues and workarounds

- `npm run build` fails in `server/`: it calls `tsc -p tsconfig.build.json`, which does not
  exist. Interim workaround: `cd server; npx tsc -p tsconfig.json` (compiles `src/` to `dist/`),
  then `npm run start` works.
- `docs/CONVENTIONS.md` cites `docs/adr/0004-json-columns.md`, which does not exist yet.
- `showSolutionsByDefault` is stored/edited in Settings but not consumed anywhere yet.
- Known a11y defect: the login password field's accessible name includes the "Forgot?" link.
