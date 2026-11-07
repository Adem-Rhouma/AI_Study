# Features

What the product does, how each feature works, and where it lives. Route tables below are the
learner-facing subset; see [ARCHITECTURE.md](ARCHITECTURE.md) for the layering that connects
them. Current content volume is listed in [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md).

| Feature | Web page | API (under `/api`) | Server module |
|---|---|---|---|
| Explore & topics | `/explore`, `/explore/:slug` | `/curriculum/*` | `server/src/modules/curriculum/` |
| Learning paths | `/paths`, `/paths/:slug` | `/paths/*` | `modules/paths/` |
| Courses & lessons | `/courses/*`, `/lessons/:slug` | `/courses/*`, `/learning/*` | `modules/courses/`, `modules/learning/` |
| Problem Arena | `/arena`, `/arena/:slug` | `/arena/*` | `modules/arena/` |
| Mastery & progress | `/progress` | `/progress/*` | `modules/progress/` |
| Library | `/resources/*` | `/library/*` | `modules/library/` |
| Research & events | `/research/*` | `/research/*`, `/events/*` | `modules/research/`, `modules/events/` |
| Notes & bookmarks | (in lesson page) | `/notes/*` | `modules/notes/` |
| Search | `/search` | `/search` | `modules/search/` |
| AI assistant | (per-lesson panel) | `/ai/*` | `modules/ai/` |
| Dashboard | `/` | `/dashboard` | `modules/dashboard/` |
| Auth & settings | `/login`, `/settings`, … | `/auth/*` | `modules/auth/` |
| Admin console | `/admin` | `/admin/*` | `modules/admin/` |

## Explore AI (curriculum)

- `GET /curriculum/domains`, `/topics` (filters: domain, subdomain, difficulty, `q`; paginated),
  `/topics/:slug` (full topic detail), `/graph` and `/topics/:slug/neighborhood?depth=1..3`.
- Topic detail ([curriculum.repo.ts → getTopicBySlug](../server/src/modules/curriculum/curriculum.repo.ts))
  assembles the topic plus relations (requires / unlocks / lateral-by-shared-tags), further
  reading, published lessons and exercises, linked resources and related paths — one repo
  function, six bound queries.
- The prerequisite map is [web/src/components/explore/TopicMap.tsx](../web/src/components/explore/TopicMap.tsx):
  difficulty bands stacked top-to-bottom (easier first), rectangular cards carrying name,
  subdomain, difficulty, estimated minutes and prerequisite/unlock counts; SVG connectors with
  arrowheads; hover/focus highlights the node's direct neighbours. It lays out from its measured
  width, so narrow viewports become a single stack. `centerSlug` marks the current topic on the
  topic page.

## Learning paths

- A path orders stages of topics and courses. `POST /paths/:slug/enroll`, `PATCH` (status:
  active/paused), `DELETE`. `GET /paths/:slug` returns the path plus *your* progress.
- Progress is computed from mastery, not clicks: topics at `practising` level or above and
  completed courses ([paths.repo.ts → progressForPaths](../server/src/modules/paths/)).
- The list honours the `featured` boolean query filter via `queryBoolean`
  ([server/src/lib/domain.ts](../server/src/lib/domain.ts)) — a deliberate fix for
  `z.coerce.boolean()` treating the string `"false"` as `true`.

## Courses and lessons

- Courses → modules → lessons → ordered typed blocks (21 block types: prose, heading, list,
  callout, math, derivation, worked_example, definition, theorem, code, exercise, quiz, image,
  table, quote, interactive, comparison, timeline, reference, checklist, tabs).
- `GET /learning/lessons/:slug` returns the lesson, adjacent lessons, the learner's scroll
  position (resume) and completion state. `PATCH /learning/lessons/:slug/position` saves it;
  `POST /lessons/:slug/complete` completes (and may complete the course when criteria are met —
  [courses.repo.ts → markCourseCompleteIfDone](../server/src/modules/courses/)).
- Rendering is client-side in
  [web/src/components/content/BlockRenderer.tsx](../web/src/components/content/BlockRenderer.tsx):
  KaTeX for math, code blocks, and quiz blocks that self-check with explanations. Lesson quiz
  blocks are formative; graded assessment lives in the Arena.

## Problem Arena

- `GET /arena/exercises` (filterable bank), `/exercises/:slug`, `POST /exercises/:slug/hint`
  (reveals the next rung of the hint ladder, tracked per attempt), `POST /exercises/:slug/attempt`
  (grades), `/attempts` (history), `/stats`, `/recommend` (what to practise next).
- Nine exercise kinds: `single_choice`, `multi_choice`, `true_false`, `numeric`,
  `short_answer`, `expression`, `derivation`, `code`, `match`. Grading
  ([arena/grading.ts](../server/src/modules/arena/grading.ts)) reads the `answer_spec` JSON:
  exact/label matching for choice kinds, tolerance for numeric, normalised text for open
  answers. Open-ended kinds (`derivation`, `code`) return `is_correct: null` — recorded, not
  scored — and true/false exercises without a recorded `expected` answer are refused (422)
  rather than silently unmarkable.
- Attempts feed mastery via the progress module.

## Mastery and progress

- [mastery.service.ts](../server/src/modules/progress/mastery.service.ts) implements
  [ADR-0003](adr/0003-mastery-model.md) exactly: `0.45·coverage + 0.45·performance +
  0.10·retention`, hint discount `max(0, 1 − 0.2n)`, retention `exp(−days/45)`, performance
  half-life 30 days, solution views score 0 and raise a revalidation flag.
- Endpoints: `/progress/overview`, `/progress/mastery(/:topicSlug)`, `/progress/activity`
  (study feed), `/progress/review` (due-for-revision topics), `/progress/export` (learner data
  as JSON).

## Library

- Curated resources (papers, books, courses, videos…) with facets
  (`GET /library/resources`, `/facets`), curated collections
  (`/collections/:slug`), per-resource bookmarking.
- Personal collections (`/library/mine*`) — a learner's own reading lists containing curated
  resources.
- Resources carry `verified` (a human opened the link) and dedupe by normalised URL.

## Research and events

- `GET /research/topics|papers|milestones|must-reads` — read-only views over the seeded
  research corpus (milestones timeline, paper index).
- `GET /events`, `/events/calendar`, `/events/:slug` — the competitions/events catalogue with a
  date-window calendar. Read-only today (see overview: interactive events are planned).

## Notes and bookmarks

- `user_notes` support quote-then-note annotations anchored to a lesson block
  ([0003_note_annotations.sql](../server/src/db/migrations/0003_note_annotations.sql)).
  CRUD under `/notes` plus bookmarks on three target kinds (`/notes/bookmarks/:kind/:slug`).
- All rows are strictly per-user; identity comes from the session only.

## Search

- `GET /search?q=` — FTS5 across topics, lessons, resources with bm25 ranking and grouping.
  Client debounces and renders grouped results ([web/src/pages/SearchPage.tsx](../web/src/pages/SearchPage.tsx)).

## AI study assistant

- `GET /ai/status` (configured? which provider? personal usage), `POST /ai/ask`,
  conversation history endpoints.
- [ai.service.ts](../server/src/modules/ai/ai.service.ts) grounds each question with the
  lesson/topic content the learner is viewing (`groundingFor`), builds provider-neutral
  messages ([prompts.ts](../server/src/modules/ai/prompts.ts)), records token usage per user,
  and degrades gracefully: with no provider configured the assistant explains how to enable it
  and everything else works. Per-user toggle in Settings; rate-limited 20/min.

## Dashboard

- `GET /dashboard` — platform stats, continue-study entries (in-progress lessons with scroll
  positions), due reviews, upcoming events. Rendered at `/`.

## Auth and settings

- Register, login, logout, `/auth/me`, display-name change, password change, delete account,
  forgot/reset password (token via `password_resets`). Preferences API: theme, density,
  reduced motion, default exercise behaviour, AI toggle.
- Roles: `learner` / `author` / `admin`; staff roles unlock draft visibility and `/admin`.

## Admin console

- Descriptor-driven Content Studio: [admin.kinds.ts](../server/src/modules/admin/admin.kinds.ts)
  defines 9 content kinds (domain, subdomain, topic, course, lesson, exercise, resource, path,
  collection) with field schemas, item shapes and integrity checks (e.g. publishing an exercise
  without a markable answer key is refused with a field error). The client renders editors from
  `GET /admin/kinds` — adding a field is a descriptor change, not a UI change.
- Status workflow `POST /admin/content/:kind/:ref/status`, per-lesson revisions
  (`/admin/content/lesson/:ref/revisions`), global `GET /admin/overview` (counts + honest
  status tallies), `GET /admin/changes` (audit trail over `content_changes`).
- Provider management (`/admin/providers*`): CRUD for AI provider rows, key encryption,
  connectivity test. User management (`GET /admin/users`, role/status patch).
