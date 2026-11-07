# AI Mastery

A self-hosted education platform for the discipline of AI — a rigorously curated curriculum,
full-length lessons with real math and code, a graded problem arena, and a mastery model that
tracks what you can actually *do*, not how long you watched.

Express 5 + SQLite API, React/Vite SPA, npm-workspaces monorepo. One Node process, one
database file, zero required external services.

## Why it exists

Self-directed AI learners hit three recurring failures, and each one is a design target here:

1. **No explicit ordering.** Material is abundant; sequencing is folklore. AI Mastery encodes
   the field as a prerequisite graph — **954 relations between 213 topics** — not a playlist.
2. **Progress theatre.** Most platforms score minutes watched or points earned. Here,
   [mastery](docs/adr/0003-mastery-model.md) is `0.45·coverage + 0.45·performance +
   0.10·retention`: hint-discounted correctness, no credit for viewing solutions, and no
   conversion into streaks or leaderboards.
3. **Untrustworthy content.** Generated teaching material fabricates citations. The content
   pipeline validates every title, author and URL, and **drops anything unverifiable with a
   report** rather than shipping it ([research contract](research/RESEARCH_CONTRACT.md)).

## The curriculum in numbers

| Domain taxonomy | Teaching material | Practice & library |
|---|---|---|
| 24 domains | 2 courses, 10 lessons | 18 exercises across 9 kinds |
| 75 subdomains | 142 typed lesson blocks | 40 curated resources, 5 collections |
| 213 topics | KaTeX math, derivations, interactives | 34 milestones, 11 events, 815 further-reading entries |

## Features

- **Explore & prerequisite map** — browse domains → subdomains → topics; a layered difficulty-banded graph of what requires what.
- **Courses & lessons** — 21 block types (math, derivations, worked examples, quizzes, interactives), scroll-position resume.
- **Learning paths** — curated multi-course routes with enrollment and mastery-derived progress (never "lessons opened").
- **Problem Arena** — graded exercises with a hint ladder; attempts feed mastery; open-ended kinds are recorded, not silently scored.
- **Mastery & progress** — per-topic score and level, review queue, activity feed, JSON data export.
- **Library, research & events** — curated resources with bookmarks and personal collections; milestone timeline; competition calendar.
- **Notes & search** — quote-anchored annotations on lesson blocks; SQLite FTS5 full-text search with bm25 ranking.
- **AI study assistant** *(optional)* — grounded per-lesson Q&A against any OpenAI-compatible / Anthropic / Ollama endpoint. Keys are AES-256-GCM encrypted at rest and never reach the client; with no provider configured, everything else still works.
- **Admin Content Studio** — descriptor-driven editing of 9 content kinds with a `draft → review → published → archived` workflow, revisions, and a full audit trail. Learners only ever see published rows.

See [docs/FEATURES.md](docs/FEATURES.md) for endpoints and code locations, feature by feature.

## Tech stack

| Layer | Choice |
|---|---|
| Server | Node ≥ 20.11, TypeScript (NodeNext ESM), Express 5, zod 4, better-sqlite3 (**no ORM** — hand-written SQL), bcrypt, Helmet |
| Web | React 18, Vite 7, Tailwind CSS 4 (CSS-first design tokens), TanStack Query 5, React Router 6, KaTeX, Radix UI |
| Data | One SQLite file (WAL, FKs on), checksummed SQL migrations, FTS5 external-content indexes |
| Auth | HttpOnly `SameSite=Lax` session cookie; DB stores only the token's SHA-256 hash; roles `learner / author / admin`; in-memory rate limits |

## Quick start

```powershell
npm install           # installs both workspaces
npm run db:migrate    # creates server/data/ai-mastery.sqlite
npm run db:seed       # loads curriculum + content, seeds staff/learner accounts
npm run dev           # API on :4000 + Vite on :5173, concurrently
```

Open http://localhost:5173. There is **no dotenv** — all config is real environment variables
with sensible local defaults (full table in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)).

Sign-in accounts created by the seeder:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@aimastery.local` | `ChangeMe-2026!` |
| Learner (with sample progress) | `learner@aimastery.local` | `Learn-2026-demo` |

Verify the API: `curl http://localhost:4000/api/health` → `{"ok":true,"service":"ai-mastery-api",…}`

### Serving on the LAN

Vite binds `localhost` only by default. To reach the dev app from another device:

```powershell
# Terminal 1
$env:PORT="4000"; $env:WEB_ORIGIN="http://<lan-ip>:5173"; npm run dev:server
# Terminal 2
$env:API_ORIGIN="http://localhost:4000"; npx vite --host 0.0.0.0 --port 5173
```

### Single-port production mode

```powershell
npm run build         # web SPA into web/dist, server into server/dist
npm run start         # API on :4000 also serves the built SPA
```

> ⚠️ Known issue: `npm run build` currently fails in `server/` (`tsconfig.build.json` is
> missing). Workaround: `cd server; npx tsc -p tsconfig.json`, then build web as usual.

## Common commands

| Command (repo root) | What it does |
|---|---|
| `npm test` | Both workspaces' vitest suites |
| `cd server; npx vitest run tests/auth.test.ts` | One focused server test (in-memory DB per test) |
| `npm run typecheck` | `tsc --noEmit` in both workspaces |
| `npm run curriculum:build` | Regenerate `server/data/curriculum/` from `research/*.json` |
| `npm run db:seed` / `db:reset` | Idempotent upsert / destructive drop-migrate-seed |
| `npm run audit` | Secrets & API-surface audit; exits 1 on CRITICAL findings |

## Content pipeline

```
research/*.json ──curriculum:build──▶ server/data/curriculum/*.json ─┐
                                                                     ├─▶ db:seed ─▶ SQLite
server/data/content/**.json ─────────────────────────────────────────┘
```

`research/` (git-tracked source of truth) and `server/data/content/` (hand-authored courses,
paths, exercises, resources) are the only places you edit content. `server/data/curriculum/` is
generated and gitignored — never hand-edit it. Changing curriculum means build → seed (see the
drop report; it tells you what failed citation validation).

## Repository layout

```
server/src/
  index.ts app.ts routes.ts config.ts    # bootstrap, middleware chain, 15 API routers, env
  lib/                                   # http envelope, crypto, auth guards, domain schemas
  db/                                    # connection, SQL helpers, checksummed migrations, CLI
  seed/ curriculum/                      # content pipeline
  modules/<feature>/                     # routes → service → repo; SQL only in *.repo.ts
web/src/
  App.tsx api/ pages/ components/ lib/ styles/   # SPA; only api/client.ts calls fetch
research/                                # literature survey JSON + contracts (source of truth)
docs/                                    # knowledge base: overview, architecture, features, development
scripts/                                 # repo-wide audit tooling
```

## Documentation

Start with the knowledge base, then the binding rules:

- [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md) — product vision, business rules, honest implementation status
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system shape, layering, database design, security model
- [docs/FEATURES.md](docs/FEATURES.md) — every feature's routes, endpoints and code location
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — environment variables, test harness, change recipes, known issues
- [docs/CONVENTIONS.md](docs/CONVENTIONS.md) — **binding** coding rules (read before editing)
- [AGENTS.md](AGENTS.md) — sharp edges for AI coding agents

## Project status

Implemented and working: the full taxonomy and Explore/map, 2 complete courses, paths with
enrollment, the Arena, mastery engine, library, research/events, notes, FTS search, AI assistant
with 3 provider adapters, Content Studio, and auth/sessions/rate limiting.

The main remaining effort is **content, not code**: ~2 of 213 topics have course-grade lesson
walkthroughs; the rest ship definition + explanation + reading + exercises. Known gaps and
planned work are listed honestly in
[docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md#implementation-status).
