# AI Mastery — Project Overview

AI Mastery is a self-hosted education platform for the discipline of AI: a curated curriculum
(24 domains → 75 subdomains → 213 topics), full-length courses and lessons, a graded problem
arena, learning paths, a curated reading library, and a mastery model that tracks what a
learner can actually do. Express 5 + SQLite API, React/Vite SPA, npm-workspaces monorepo.

This document explains *why* the product exists and *what it must do*. How it is built lives in
[ARCHITECTURE.md](ARCHITECTURE.md), feature-by-feature in [FEATURES.md](FEATURES.md), and
day-to-day work in [DEVELOPMENT.md](DEVELOPMENT.md).

## The problem it solves

Self-directed learners studying AI face three recurring failures:

1. **No explicit ordering.** Material exists in abundance, but *what to learn first* and *why
   this before that* is left to the learner. AI Mastery encodes the ordering as a prerequisite
   graph (954 relations between topics) instead of a playlist.
2. **Progress theatre.** Most platforms measure minutes watched or points earned. AI Mastery's
   mastery model ([docs/adr/0003-mastery-model.md](adr/0003-mastery-model.md)) measures
   coverage, hint-discounted correctness, and retention — and deliberately credits nothing for
   merely viewing a solution.
3. **Untrustworthy content.** AI-generated teaching material routinely fabricates citations.
   The content pipeline ([research/RESEARCH_CONTRACT.md](../research/RESEARCH_CONTRACT.md))
   treats every title, author and URL as data that must survive validation; anything that
   cannot be verified is dropped with a report, never shipped.

## Vision and objectives

From the original product specification and the UX research
([research/10-product-ux-research.md](../research/10-product-ux-research.md)):

- A **complete, rigorous curriculum** of the AI field — mathematics through safety — stored as
  application data, never generated live by an LLM.
- A "premium commercial education product" feel: math-heavy (KaTeX), code-heavy, with a real
  prerequisite graph — modelled on the evidenced practices of Brilliant (attempt before
  instruction), Khan Academy (mastery levels decoupled from engagement points), 3Blue1Brown
  (explanation-first lessons), Distill (interactive figures) and Exercism (attempt history,
  hint ladders).
- **Provider-agnostic AI assistance**: the study assistant works against any
  OpenAI-compatible / Anthropic / Ollama endpoint, with keys held server-side only.
- **Everything is data**: all educational content is seeded into relational tables and editable
  through the admin Content Studio — no hand-edited database rows, no content baked into code.

## Target users

- **Self-directed adult learners** with a technical background (engineers, grad students) who
  want precise prose, derivations and honest difficulty — not gamified snippets.
- **Authors/admins** (staff) who author and publish curriculum content through the Content
  Studio, manage AI providers and accounts.

## Main features (and their purpose)

| Feature | Purpose |
|---|---|
| Explore AI | Browse the field by domain; per-topic pages with definition, explanation, relations, reading |
| Prerequisite map | See the ordering of the field / a topic's neighbourhood as a layered map |
| Courses & lessons | Full-length teaching material with LaTeX math, code, derivations, self-check quizzes |
| Learning paths | Curated multi-course routes with explicit enrollment and honest progress |
| Problem Arena | Graded exercises across 9 kinds, with a hint ladder and attempt history |
| Mastery & progress | Per-topic mastery score, review queue, activity feed, data export |
| Library | Curated resources and reading lists, personal bookmarks and collections |
| Research & discover | Field milestones, competition/event calendar, must-read lists |
| Notes & bookmarks | Quote-anchored annotations on lessons and blocks |
| Search | Full-text search across topics, lessons, resources (SQLite FTS5) |
| AI study assistant | Optional, grounded Q&A per lesson/topic via a provider of the admin's choice |
| Admin console | Descriptor-driven Content Studio, AI providers, user accounts, audit trail |

## Business rules and domain concepts

These are decisions, not implementation details. Code that touches them must respect them.

- **Curriculum hierarchy**: `domain → subdomain → topic`. Difficulty is one of five levels
  (`introductory → expert`). Relations between topics have a direction (requires/unlocks) and a
  kind (`strict`, `recommended`, `related`, `extension`).
- **Mastery** ([docs/adr/0003-mastery-model.md](adr/0003-mastery-model.md)):
  `score = 0.45·coverage + 0.45·performance + 0.10·retention`, mapped to six levels
  (`new → mastered`). Hints discount credit (`1 − 0.2n` for the nth hint); viewing a solution
  credits **zero** and flags the topic for revalidation. Mastery is not convertible into points,
  streaks or leaderboards.
- **Path progress** counts topics the learner has reached *practising* level on and courses
  completed — never lessons merely opened.
- **Publishing workflow**: content rows move `draft → review → published → archived`. Learners
  only ever see `published` rows; staff with `author`/`admin` roles can see drafts. Publishing
  is refused for content that could not function (e.g. an exercise with no markable answer key)
  and every staff edit lands in the `content_changes` audit table.
- **Citation integrity**: no invented titles, authors or URLs — in content files or in UI.
  Resource rows carry a `verified` flag that only means a human opened the link.
- **Privacy**: notes, bookmarks, enrollments, attempts and AI conversations are strictly
  per-user; the server derives identity from the session only (`req.user.id`), never from
  request bodies or query strings.
- **Provider keys** never reach the client: they are stored AES-encrypted and used server-side.

## Implementation status

Honest state of the codebase (verified against the live database, November 2026):

**Implemented and working**

- Full curriculum taxonomy (24 domains / 75 subdomains / 213 topics, 815 further-reading
  entries, 954 prerequisite relations), Explore pages and prerequisite map.
- 2 complete courses ("Foundations of Machine Learning", "Deep Learning: Core Mechanics") with
  10 lessons / 142 typed blocks; lesson rendering with KaTeX, code, interactives.
- 2 learning paths (18 topics each) with enrollment and progress.
- Problem Arena: 18 exercises across 9 kinds, hint ladder, attempt grading, recommendations.
- Mastery engine, progress dashboard, review queue, activity feed, JSON export.
- Library: 40 curated resources, 5 curated collections, bookmarks, personal collections.
- Research section: 34 milestones, 11 competitions/events with calendar, must-reads.
- Notes with quote/block anchoring; full-text search (FTS5).
- AI study assistant: 3 provider adapters, per-user conversations and usage accounting.
- Admin console: Content Studio (9 content kinds, revisions, status workflow, audit log),
  provider management with key encryption, user management.
- Auth: register/login/logout, sessions, password reset, roles, preferences, rate limiting.

**Partial / known gaps**

- Only 2 of the ~213 topics have full lesson walkthroughs; the rest have curated
  definition + explanation + reading + exercises but no course-grade material yet. This is the
  main remaining content effort, not a code gap.
- The `showSolutionsByDefault` preference is stored and editable in Settings but no UI consumes
  it yet.
- The `uploaded_files` table and `/uploads` static serving exist, but no upload endpoint is
  implemented (media in lessons is referenced by URL).
- `npm run build` fails in `server/` (missing `tsconfig.build.json`); see DEVELOPMENT.md for
  the workaround.
- `docs/CONVENTIONS.md` references `docs/adr/0004-json-columns.md`, which has not been written.
- Known accessibility defect: the login page's password field label wraps the "Forgot?" link,
  so its accessible name is wrong.

**Planned** (from the original specification, not started)

- Curriculum gap audit against the A6 research agenda; lesson authoring across the taxonomy;
  interactive events/competitions (currently a read-only catalogue).
