# Code conventions — AI Mastery

Read this before touching any file. These are binding, not advisory; they exist so parallel
work integrates without rework.

## Stack

- `server/` — Node 20+, TypeScript ESM (`"module": "NodeNext"`), Express 5, better-sqlite3,
  zod 4, vitest. No ORM: SQL is hand-written in migrations, queries live in repositories.
- `web/` — Vite 7, React 18, TypeScript, Tailwind CSS 4 (CSS-first tokens), React Router 6,
  TanStack Query 5, KaTeX via react-markdown/remark-math/rehype-katex, Radix UI primitives.

## Server rules

1. **Relative imports end in `.js`** (NodeNext ESM). `import { x } from './y.js'` always.
2. **Never edit files you do not own.** `src/routes.ts`, `src/app.ts`, `src/config.ts`,
   `src/db/*`, `src/lib/*` and `docs/*` are owned by the project lead. Module code lives in
   `src/modules/<feature>/`. If you need something from a shared file, work with what is there.
3. **Database access** goes through `src/db/sql.ts` helpers (`all`, `get`, `run`, `insert`,
   `tx`, `prepare`) and only from a `*.repo.ts` file. Route files call `*.service.ts`, services
   call repositories.
   - Named binds: `get(db, 'SELECT * FROM topics WHERE slug = @slug', { slug })`.
   - Anonymous binds: a single-value object with `?` works (`{ email }` against `email = ?`);
     multiple `?` must be passed as an array in positional order.
   - **Never interpolate user input into SQL.** Only placeholders. Integer ids built into `IN (...)`
     lists must be coerced with `Number()` first.
4. **Every handler** is wrapped: `router.get('/x', handler((req, res) => { ... }))`. Throw
   `ApiError.badRequest/notFound/forbidden/unauthorized/conflict/tooMany`; never `res.status(500)`
   by hand. Parse input with zod and let the error middleware turn `ZodError` into a 422.
5. **Authorization**: `requireAuth`, `requireStaff`, `requireAdmin` from `src/lib/auth-context.js`
   are route middleware. `req.user` is the *session* user and is the only trusted source of a user
   id. **Never read a user id from the request body or query.** All learner-private reads/writes
   filter by `req.user.id`.
6. **Draft visibility**: content is `status = 'published'` for anonymous and learner callers;
   `author`/`admin` may pass a `?status=all` flag. Use the existing `canSeeDrafts(req)` idea from
   `modules/curriculum/curriculum.routes.ts`.
7. **Timestamps** are ISO-8601 UTC strings via `nowIso()` from `src/lib/domain.js`.
8. **JSON columns** are for ordered scalar lists and per-type block config only, validated at the
   edge with `parseJsonArray` / `parseJsonObject`. Anything with identity or a cross-reference is
   a real table with a foreign key. See `docs/adr/0004-json-columns.md`.
9. **Money/score arithmetic** stays in JS floats rounded to 4 decimals at the boundary; there is
   no currency in this product.
10. **Logging** is `console.log('[tag] message')` — the same style already used in `index.ts`.
    No logging of secrets, tokens, passwords or full API keys.

## Tests

- Location: `server/tests/<area>.test.ts`. Use the shared harness in `server/tests/helpers.ts`:
  `freshDb()`, `makeApp(db)`, `registerUser(app, {email})`, `makeStaff(app, db, email, 'admin')`,
  `authHeader(user)`, `insertTopicFixture(db, {...})`, `seedLessonWithTopic(db, {...})`, `request`.
- Each test gets its own in-memory database. Do not touch `server/data/*.sqlite` in tests.
- Run only your own file: `npx vitest run tests/<area>.test.ts` from `server/`. Do not start the
  dev server — ports are owned by the lead.
- Also run `npx tsc --noEmit -p tsconfig.test.json` and fix every error including unused locals.

## Frontend rules

1. Data fetching only through TanStack Query with keys declared in `src/api/keys.ts`.
   `web/src/api/client.ts` is the only place that calls `fetch`.
2. Components in `web/src/components/<area>/`, pages in `web/src/pages/<area>/`. One exported
   component per file, file named after the component.
3. Styling only with the design tokens in `web/src/styles/tokens.css` exposed as Tailwind theme
   utilities (`bg-surface`, `text-ink-muted`, `border-hair`, `rounded-card`, …). No hard-coded
   hex, no `px` magic numbers where a scale step exists.
4. Every interactive control needs hover, focus-visible, active, disabled, loading and error
   states. Buttons must do what their label says or not exist.
5. Text that can be empty must have an empty state; lists that can be large must paginate or
   virtualise; async views need skeletons.
6. Accessibility: semantic landmarks, one `h1` per page, labelled inputs, `aria-live` for async
   results, dialogs trap focus (Radix does), motion respects `prefers-reduced-motion` and the
   user's `reducedMotion` preference.

## Product rules that override convenience

- No fake live data. Curated competitions/events are labelled with their curation date.
- Opening a lesson never marks it complete.
- No statistic on the dashboard unless a learner decision changes because of it.
- Anything unreachable from the navigation is a defect.
