# 10 — Product & UX Research for AI Mastery

Agent: A7 (product/UX research). Date: 2026-11-05.
Method: direct WebFetch of the cited products where possible, WebSearch for current facts, plus clearly-marked design judgment. Anything marked **[J]** is my recommendation, not an observed product fact. Anything with a URL was verified this session unless noted "verified via search snippet only" or "could not verify".

Scope reminder: AI Mastery is a local React+Vite / Express+SQLite education platform with a fixed IA (Dashboard, Explore AI, Learning Paths, Courses, Lessons, Resources, Problem Arena, Research & Discover, Progress, Profile & Settings, Admin). Content is math-heavy (KaTeX), code-heavy, has a real prerequisite graph. Target feel: premium commercial education product.

---

## 1. Competitive / exemplar audit

### 1.1 Brilliant — problem-first lessons
Source: https://brilliant.org/about/ (fetched).
Observed: Brilliant's stated method is "interactive, adaptive" lessons with **no video lectures**, and they explicitly "pretest on the material, letting the learner try to find a solution before learning the procedure." Lessons are sequences of small interactive questions with immediate feedback, not reading.
Why it works: effortful recall before exposition is one of the best-evidenced learning interventions (generation effect; pre-testing effect). It also makes every session *active*, which is what separates a course you watch from a course you finish.
**Adopt [J]:** every lesson in AI Mastery should open with a 1–3 question "intuition probe" before the explanation body, and every exercise should allow attempt-before-hint. **Adapt:** Brilliant's full no-text model is wrong for us — our audience includes engineers who want precise prose and derivations. Hybrid: probe → text+math body → embedded checks.

### 1.2 Khan Academy — mastery levels and practice loop
Sources: help article "What are Course and Unit Mastery?" https://support.khanacademy.org/hc/en-us/articles/115002552631 (exists; page returned 403 to direct fetch — verified via search snippet: "Khan Academy's Mastery System helps you track your learning progress in a course. As you practice, your skill levels can change based on…"). Their teacher-facing material (khan-for-educators) repeatedly frames mastery as the goal: "guiding students to 60 skills to proficient in a single year."
Observed (well-documented, flagged as partially snippet-verified): Khan replaced the old "mastery points" economy with **energy points** (activity/engagement) that are *separate from* **skill mastery levels** (attempted → familiar → proficient → mastered, earned through practice questions and mastery challenges, not through watching videos).
Why it matters: this is a public, instructive *retreat*. Khan deliberately decoupled "time spent" from "can do" after years of students grinding points by watching videos. That is directly relevant to our mastery-model design (§4.1).
**Adopt [J]:** the two-track split (engagement signal vs mastery state) and the rule that passive viewing can at most set "attempted". **Reject [J]:** energy points as a visible number on a dashboard for self-directed adult learners — it reads as school software.

### 1.3 3Blue1Brown — explanation as the unit of teaching
Source: https://www.3blue1brown.com/ (fetched): the site is organized as text-and-visual "Lessons" (Essence of Linear Algebra, Essence of Calculus) that stand alongside the videos, not under them.
Observed: the lesson page — not the video — is the atom. Visuals are *of* the concept (the math is the animation), explanations proceed by building one mental object at a time, and prerequisite lessons are cross-linked explicitly (e.g., matrix-multiplication lesson precedes determinant lesson in the series order).
Why it works: Grant's method is concrete: introduce a question, show the naive answer, show what breaks, rebuild. That maps to a reusable lesson grammar, not just to videos.
**Adopt [J]:** a fixed lesson rhetorical skeleton (§4.3): *intuitive question → wrong-but-natural model → repair → formal statement → worked example → check*. This is a content-authoring contract for Admin-managed lessons, not just a style.

### 1.4 Distill.pub — interactive explanations as publishing format
Source: https://distill.pub/about/ (fetched): a 2016–2021 journal of "clear, dynamic" ML research communication with interactive visuals; the journal is now on "indefinite hiatus".
Observed: Distill articles pair prose with scroll-linked / interactive figures, inline citations rendered as hoverable margin notes, and a strongly typographic layout (serif body, wide margins). Famous exemplars: "A Neighborhood of Images", "Visualizing memorization in RNNS", "Exploring Neural Networks with Activation Atlases".
Why it works: the figure *is* an argument; readers manipulate parameters and the prose tells them what to look for. It remains the highest-quality reference for what a "lesson with an interactive demo" looks like.
**Adopt [J]:** a widget contract: every interactive demo in a lesson declares *what the reader should change* and *what they should observe* ("drag λ and watch the bias/variance tradeoff invert"), rendered in a consistent framed container with caption + reset control. **Note [J]:** Distill's hiatus means we imitate its format, not its tooling (they used a bespoke web component system; we standardize on React components).
Sources: https://distill.pub/about/, https://distill.pub/2017/feature-visualization/.

### 1.5 Exercism — the single most relevant model for Problem Arena
Sources: https://exercism.org/about (fetched — thin), https://exercism.org/docs/using (fetched — thin; confirmed "practice and mentoring" framing); structure verified from Exercism's public concept-exercise docs and track pages: https://exercism.org/docs/training/overview, https://exercism.org/tracks/python/concepts (concept pages per language track, fetched indirectly via track listing). Flag: the deep detail (concept map UI, iterative mentoring) is from my prior use of the product plus docs pages that render only partially to fetchers; treat exact UI wording as "observed previously, not fully re-verified".
Observed: (a) **Concept exercises** unlock concepts progressively — you never see a concept in an exercise before it has been taught; the syllabus is a directed graph of concepts ("concept map") rendered as a hex-grid path. (b) **Practice exercises** are the open bank, difficulty-rated. (c) **Iterative mentoring**: a solution is not pass/fail; a human (or now AI) mentor leaves line-level discussion, and each submission creates a new "iteration" — the attempt history is the learning artifact. (d) Test cases are visible as a suite with pass/fail per case, so failure is *diagnostic*, not a wall of red.
Why it works: progressive disclosure removes the "I saw a concept in a test before it was taught" rage that kills exercise platforms. Visible test suites convert failure into information.
**Adopt [J] wholesale for Problem Arena:** unlock rules tied to the prerequisite graph (§4.4), per-case result display, attempt/iteration history as first-class UI, and hints as an ordered progressive ladder rather than a "Show answer" toggle.

### 1.6 NeetCode — the roadmap genre done with a syllabus
Source: https://neetcode.io/roadmap (fetched): a structured topic-order roadmap (Arrays & Strings → Two Pointers → … → DP → Graphs) with problems grouped under each node, and a visual graph of topic relationships.
Observed: the roadmap node = topic; under each node a curated, *ordered* problem list ("Blind 75 / NeetCode 150" as a canonical path). Its power is that it answers "what do I do next?" in one screen and the graph communicates "why this order" (arrows = prerequisites).
Why it works: interview prep is anxiety-driven; a single authoritative path plus per-topic buckets reduces decision cost to zero.
**Adopt [J]:** Learning Paths as curated ordered lists (NeetCode's "pick one canonical sequence"), Explore AI as the graph view. **Adapt:** NeetCode's graph is decorative at small zoom; our graph must be navigable, not pretty (§3.2).
Source: https://neetcode.io/practice.

### 1.7 Hugging Face Learn + Hub IA
Source: https://huggingface.co/learn (fetched): a catalog of focused courses (LLM Course, Agents Course, Diffusion Course, Deep RL Course, small domain courses), each a lesson list under a single URL namespace, coexisting with the global Models/Datasets/Spaces hub navigation and the Cookbook ("notebooks by AI builders, for AI builders").
Observed: HF's bet is that **content and artifacts share one namespace**: a lesson references model/dataset/dataset-card URLs directly, and the course is basically structured markdown with progress. Courses are short, tool-anchored, and version with the libraries.
Why it works: no context switch between "learning about a model" and "the model". For an AI curriculum this is the right data model: **every entity (dataset, paper, repo, model, library) is a first-class Resource with a canonical link**, and lessons reference entities, not copies.
**Adopt [J]:** Resources library as an entity store (paper / dataset / repo / video / tool / blog-post types, each with its own card and stable slug) that lessons, problems, and paths can link into. This is what "Research & Discover" needs to feel connected rather than a bookmark dump.
Sources: https://huggingface.co/learn, https://huggingface.co/learn/cookbook/.

### 1.8 DeepLearning.AI short courses
Source: https://www.deeplearning.ai/short-courses/ (fetched): a catalog of 1–3 hour courses (durations shown explicitly, e.g. "1h3m"–"2h49m"), each co-branded with a partner/tool (Qdrant, Oracle, JetBrains), listed with level tags.
Observed: the unit of "doable" is one sitting, and the *stated duration* is the engagement contract. Courses are video+notebook, free-with-account, and the catalog page is essentially a filterable grid — nothing fancy.
**Adopt [J]:** per-lesson and per-path **time-to-complete estimates** surfaced in the UI ("~25 min") — it's the cheapest premium signal in self-paced learning. **Adapt:** their partner-driven catalog model isn't ours; but their "one course, one tool, one outcome" naming discipline ("Building systems with X") is a good title grammar for our paths.

### 1.9 MIT OpenCourseWare
Source: https://ocw.mit.edu/courses/ (structure well-documented): a course page = fixed sections (Overview / Learning Materials: lecture notes, videos, *assignments*, exams with solutions / Instructor Insights). Assignments and solutions are separate downloadable artifacts.
Observed: OCW's weakness is exactly our product's job — no progression state, no answer to "what next", no prerequisite visibility; it's a file dump with a syllabus PDF. Its strength: **separation of teaching material from assessment from solutions**, and honest difficulty (real problem sets, not quizzes you can't fail).
**Adopt [J]:** Problems and their solutions are distinct content entities; "solution revealed" is logged and affects the mastery model (§4.1). Real exercises that can fail. **Reject:** file-dump IA.
Source: https://ocw.mit.edu/courses/res-6-012-introduction-to-probability-spring-2018/ (example course shell, verified pattern).

### 1.10 Coursera / edX
Sources: https://www.coursera.org/courses?query=machine%20learning, https://www.edx.org/learn/machine-learning (listing patterns verified via search; deep UI not fetched this session — flagged).
Observed (widely known, stable): course shells = syllabus of modules with per-module duration, unlock-by-week (edX) or self-paced sections (Coursera), one "enroll → resume" CTA above the fold, graded assignments intermixed with videos. Coursera's post-2023 redesign pushes role/career bundles above individual courses.
Why it matters for us: the *enroll → continue* loop with a course-progress rail is the single most-copyable commercial pattern; their failure mode (which we must avoid [J]) is the landing-page-for-everything homepage that markets courses at you instead of letting you study.
**Adopt [J]:** explicit enrollment (even in a local app) as the thing that seeds your Learning Paths state; a course home page that shows syllabus + your per-module completion + resume position in one screen.

### 1.11 Kaggle Learn + Competitions
Source: https://www.kaggle.com/learn (listing known; JS-heavy, fetch unreliable — flagged as prior-knowledge-verified): "micro-courses" of ~4 hours broken into 5–8 short kernels-based steps; "Your Next Steps" panel; certificate per micro-course. Competitions side: https://www.kaggle.com/competitions — leaderboards, notebooks ("discussions + code share the same page"), progression from tutorial competitions to live ones.
Observed: Kaggle's two lessons for us: (1) **Learn tracks terminate in a real artifact** (a submission, a notebook), which is why the micro-course feels earned; (2) the public-notebook culture shows solutions *alongside* problems — our Problem Arena should expose "community/reference solutions" as a distinct, later-reveal tier separate from the official solution (§4.4).
**Adopt [J]:** capstones: every path ends in a build artifact (train something, write up results) stored in Resources.

### 1.12 Obsidian graph view — what a graph UI must survive
Source: https://obsidian.md/help/graph (redirect confirmed; description from Obsidian's feature docs, partially fetch-verified): global graph = all notes as nodes, all wikilinks as edges, with filters (path, tag, link-depth, color groups); local graph = 1-hop neighborhood of the current note.
Observed: the global graph is beloved for *orientation* ("is my vault coherent?") and nearly useless for *navigation* — hairballs have no reading order. The **local graph** (neighbors of what you're reading) is the actually-useful primitive.
**Adopt [J] with conviction (§3.2):** Explore AI ships as a *hierarchy-first* browser (tree of Domain > Subdomain > Topic, like HF docs / Stripe docs) with a graph view as a *secondary lens*, and the always-useful "local graph" embedded in every lesson (prerequisites in, dependents out). Full-curriculum force-directed graph on a 500-topic syllabus is decoration.
Source: https://obsidian.md/help/graph.

### 1.13 Miro / infinite canvas — reject for this app **[J]**
Infinite canvases (https://miro.com/) solve collaborative spatial brainstorming. A solo learner with a fixed prerequisite DAG does not need free placement; they need depth, order, and search. Free-canvas layouts make a curriculum look arbitrary. Reject the canvas; adopt only the *minimap* idea inside our graph view.

### 1.14 Fast.ai — top-down contract with the learner
Source: https://course.fast.ai/ (fetched): explicitly "top-down, practical-first, code-first": "The book shows examples first, and only covers theory in the context of concrete examples."
Observed: fast.ai's rhetorical moves: start from a thing that works (train a pet classifier in minute one), keep "the magic" black boxes *labeled*, open the black boxes in strict order later; dismiss gatekeeping prerequisites ("no math or programming degree needed") while being brutally rigorous once you're in.
**Adopt [J]:** two entry contracts per topic, stated in the data model: `intro: hands-on-first` (a runnable result before the theory) and `deep: foundations` (full derivation). Learners pick per path. This serves both our beginner and engineer personas without two curricula.

### 1.15 Diátaxis + Stripe docs — the developer-docs IA discipline
Sources: https://diataxis.fr/ (fetched: four content types — tutorials (learn), how-to guides (do), reference (know), explanation (understand), organized by user-need); https://docs.stripe.com/ (fetched: left product tree / middle prose / right code column).
Observed: Diátaxis's core rule is **never mix types in one page** — a tutorial must not become reference. Stripe's premium feel comes from typographic restraint, one accent color, code always visually adjacent to the sentence it illustrates, and a sidebar that is the product model, not a page list.
**Adopt [J]:** lesson content blocks are typed (explain / demonstrate / reference / exercise) and the renderer styles them distinctly. Resource cards carry a `doc-type` tag from Diátaxis so learners filter by intent. Our docs-like areas (Admin, Settings) borrow the Stripe sidebar/content split.

### 1.16 Atlas/landscape genre — "Explore AI" naming risk
Two real things share this name: Kate Crawford's *The Atlas of AI* (Yale UP, 2021; book, political-economy framing — https://yalebooks.yale.edu/book/9780300249167/the-atlas-of-ai/), and the Stanford **AI Index** (annual report; https://hai.stanford.edu/ai-index — redirect from aiindex.stanford.edu/report confirmed), which presents "key findings" as data-forward chapters with OWID-style charts. Sander Dieleman's long-form visual essay "The Atlas of AI" (Sep 2024) is well known but **I could not verify its current URL this session** — do not cite it in UI text until confirmed.
**Adopt [J]:** Research & Discover should imitate the **AI Index pattern** — "here are this edition's headline findings, each linking to a chart and a topic page" — because it converts the graph from a syllabus into a field map with evidence. This gives the area a reason to exist beyond "links folder".

### 1.17 Colab / Observable — interactive computational documents
Sources: https://colab.research.google.com/ (product pattern well-documented: cells + runtime state + "open in playground" no-install entry), https://observablehq.com/ (notebooks as *documents*: reactive cells, published pages where the notebook chrome disappears and only the visualization remains).
Observed: Observable's key insight for us: **the finished lesson should not look like a notebook.** Cells are an authoring format; the published artifact should be prose with *embedded, purposeful* widgets (each widget framed with a caption and a "what to try" line). Colab's insight: "run it without installing anything" is the highest-value button on a tutorial.
**Adopt [J]:** lesson widgets are read-mostly with explicit interaction affordances; runnable code gets a copy-to-clipboard + (stretch) a sandboxed runner badge. A local app already wins the "no install" argument; don't re-add notebook chrome.

### 1.18 micrograd / from-scratch repos — the "small enough to hold" pedagogy
Source: https://github.com/karpathy/micrograd (fetched): "a tiny autograd engine (~100 lines)" with a PyTorch-like API, positioned as the on-ramp to understanding backprop. Related genre: karpathy's nn-zero-to-hero, Raschka's build-an-LLM-from-scratch (https://github.com/Raschka-research-group/ — genre verified via search; individual repo not fetched this session).
Observed: the pedagogical claim is *completeness over size*: a learner can read the whole implementation in one sitting, which builds the "I could build this" belief that surveys and libraries never build.
**Adopt [J]:** a Problem Arena exercise type "build-it-in-minature": constrained, scaffolded, ~100-line implementations (micro-MLP, micro-tokenizer, micro-attention) with property-based checks, treated as the culminating exercises of foundation topics. Show an explicit LOC budget in the problem header — it signals intent ("small on purpose").

### 1.19 Stefanini / Anaconda training (skipped)
Anaconda's product (docs/environments) is a tooling story, not a teaching-UX story; Stefanini is enterprise training with no verifiable public design detail. Per instructions, skipped.

---

## 2. Design-system direction (solo-implementer scale) **[J throughout unless cited]**

### 2.1 Typography — the single biggest premium lever
Math-heavy reading demands a **text serif for prose, a humanist sans for UI chrome, and a real mono for code**. KaTeX renders its own bundled fonts — verified from the KaTeX repo (https://github.com/KaTeX/KaTeX/tree/master/fonts): `KaTeX_Main`, `KaTeX_Math` (italic), `KaTeX_BoldExtra`/AMS, Caligraphic, Fraktur, SansSerif, Script, Size, Typewriter — a Computer Modern derivative family. **Do not fight KaTeX**: choose a UI serif that harmonizes with CM's high-contrast, slightly academic look, and never restyle `.katex` fonts.
Concrete pairing (all Google Fonts, self-hosted via `@fontsource` since the app is local/offline-first — judgment):
- Prose/body + h3–h6: **Source Serif 4** (Adobe CM-adjacent, full italic set, tabular figures). Alternative: **Spectral** (slightly warmer). Fallback chain: `"Source Serif 4", Georgia, "Times New Roman", serif`.
- UI chrome, nav, labels, buttons, table headers: **Inter** (or **IBM Plex Sans** for a less-default feel). Chain: `Inter, system-ui, "Segoe UI", sans-serif`.
- Code + math-adjacent literals: **JetBrains Mono** or **IBM Plex Mono**. Chain: `"JetBrains Mono", ui-monospace, Consolas, monospace`.
Recommendation **[J]:** IBM Plex Sans + Source Serif 4 + IBM Plex Mono is the most "designed" trio available on Google Fonts and shares superfamily DNA (Plex), which Inter (now ubiquitous) lacks; Inter is the safe fallback choice.
Type scale (modular 1.25, desktop): caption 13 / body 17 / small-title 19 / h4 21 / h3 26 / h2 32 / h1 40 / display 48. Lesson body: 17px/1.7, measure **max 72ch** (≈680px column). Line-height compresses with size (40px heading → 1.2). Never justify. Small caps (font-variant-caps) for eyebrow labels — cheap, distinctive, no extra font weight needed.

### 2.2 Color: semantic tokens, two themes, one accent
Token set (CSS custom properties; judgment): `--bg-base`, `--bg-raised`, `--bg-sunken` (code blocks), `--bg-inverse` (banners), `--text-primary/-secondary/-muted/-inverse`, `--border-subtle/-strong`, `--accent` (single saturated brand hue; suggestion: deep teal `#0F766E` light / `#2DD4BF` dark-optimized), `--success/--warning/--danger/--info` (each with `-bg` and `-text` variants per theme), `--mastery-1..4` (progression ramp, see 2.5).
Rules: components consume tokens only; themes are just two token maps on `[data-theme]`; one accent — a second decorative hue is how templates look. Dark mode is a first-class default option (this audience lives in dark IDEs); check it against §5 contrast numbers, don't invert.
Color-blind safety **[J, standard practice]**: mastery/progression must never be *only* hue-coded; pair every status color with a glyph or fill-pattern (outlined/half/full). Test accents against #000/#FFF on the simulators; the WCAG floor is §5.

### 2.3 Spacing / radius / elevation
- 4px base scale, powers used as tiers: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96. Section rhythm: 48–64 between content sections, 24–32 within. Dense tables/cards use multiples of 8 only.
- Radius: 6px inputs/buttons, 10px cards, 14px modals, 999px pills *only* for status chips. Uniform large radius on everything is a template tell; mixed radii by component class is a design tell.
- Elevation = 3 tiers, dark-mode-aware: `--shadow-1` (resting card: 0 1px 2px, low alpha) / `--shadow-2` (popovers, sticky header) / `--shadow-3` (modals only). In dark theme prefer a 1px border + slightly raised bg over shadows (shadows read as black mush on dark bg). One rule that instantly raises perceived quality: **borders carry structure, shadows carry only motion state**.

### 2.4 Component inventory with mandatory states
Components: Button (primary/secondary/ghost/danger/icon), Input, Select, Checkbox, Radio, Switch, Slider, Chip/Tag, Tabs, Tree nav, Breadcrumbs, Pagination, Tooltip/Popover, Modal, Toast, ProgressBar, RadialMastery, Card (lesson/topic/stat variants), Table (data + TOC variants), CodeBlock, MathBlock, Callout (note/warning/definition/theorem/proof/quotation), ExerciseEmbed, HintLadder, Figure (static + interactive, with caption), CommandPalette, GlobalSearchInput.
Every interactive component ships with, non-negotiably: default / **hover** / **:focus-visible** (2px accent ring, offset 2px — never remove outline without replacing it) / active/pressed / disabled (reduced opacity + `cursor:not-allowed` + tooltip why) / loading (skeleton for panels; spinner *inside* button with width lock) / empty (illustrated + one action, never a bare "No data") / error (inline message tied to field via `aria-describedby`). The empty and error states are where "is this a real product?" gets answered — CRUD demos ship exactly these two missing.

### 2.5 Rendering the scholarly content types **[J]**
- **Callouts**: left-border 3px in semantic color + tinted bg + label line (small caps: "Definition", "Theorem", "Warning", "Key idea", "Pitfall"). Definition/theorem/proof are their own types, not note variants — learners scan for them.
- **Theorem/Definition blocks**: numbered ("Theorem 3.2"), `dt/dd`-style structure, proof collapsed by default in a `<details>` with "Show proof". Numbering must be stable and linkable (anchors like `#thm-3-2`) so cross-references can cite them.
- **Math**: inline KaTeX baseline-aligned; display blocks centered with generous 24px whitespace, numbered right-aligned on wide screens, referenced as `(eq 2.4)`. KaTeX gets `aria-label`/`.katex-html` alt strategy per §5.
- **Code blocks**: dark `bg-sunken` in *both* themes (reads as "code", consistent), language chip top-right, copy button, line numbers optional per block, horizontal scroll with edge-fade, never wrap for code.
- **Tables**: numeric columns right-aligned with tabular figures; header row `bg-raised`; row hover tint; sortable columns show aria-sort. TOC tables use borderless style.
- **Figures/widgets**: identical frame (border + caption below, italic-ish sans 14px), interactive ones get a "Try it" strip (accent-tinted) naming the control to touch, and a Reset button. Static and interactive figures share one container so the page rhythm doesn't stutter.
- **Density rhythm**: text → figure → text → callout → math should feel metered; enforce by giving each block type fixed vertical margins (24 above / 24 below, collapse adjacent).

---

## 3. Information architecture & navigation

### 3.1 Shell + routes **[J]**
App shell: left rail (collapsible; Dashboard, Explore, Paths, Courses, Arena, Resources, Research, Progress, Settings/Admin), top bar (context breadcrumbs center-left, search + ⌘K right, theme toggle, user avatar). Two-column inside content-heavy areas (Stripe pattern: nav tree + content). Route table:

| Route | Screen | Notes |
|---|---|---|
| `/` | Dashboard | |
| `/explore` | Explore AI | `?view=tree\|graph\|list` (default tree), deep-linkable `/:topicSlug` → canonical `/:domainSlug/:subdomainSlug/:topicSlug` |
| `/paths` | Learning Paths list | `/paths/:pathSlug` detail+enroll |
| `/courses` | Courses catalog (filters) | `/courses/:courseSlug` syllabus+resume |
| `/lessons/:lessonSlug` | Lesson player | flat for back-nav simplicity; breadcrumb carries hierarchy |
| `/arena` | Problem Arena | filters: topic, difficulty, status |
| `/arena/:problemSlug` | Problem detail | `?tab=statement\|submissions\|discussion` |
| `/resources` | Resources library | `/resources/:resSlug` |
| `/research` | Research & Discover | findings feed, `/:topicSlug` map-back |
| `/progress` | Progress | `?tab=mastery\|heatmap\|time\|streaks` |
| `/profile` | Profile & Settings | preferences, notes export, data |
| `/admin` | Admin CMS | `/admin/topics\|lessons\|problems\|resources`, `/admin/graph` editor |
| `/search?q=` | Full results | `/` key or ⌘K → CommandPalette (nav, search, actions, resume) |

### 3.2 Where the graph belongs **[J, grounded in §1.12]**
- **Canonical representation**: hierarchy (Domain > Subdomain > Topic) — it's serializable, readable on a phone, and matches how HF/Stripe/MIT structure knowledge.
- **Explore AI** defaults to the tree (like docs sites), with a graph *toggle*: graph renders one subdomain at a time (~10–40 nodes), edges = `prerequisites_strict` (solid) vs `recommended` (dashed), node color = mastery level, click → topic panel (not a page hop). A whole-curriculum graph is allowed only as a zoomed-out "field map" poster view with clustering by domain, explicitly non-navigational.
- **Every topic/lesson page** embeds a **local graph** (prerequisites ← this → dependents, 1-hop), which is the Obsidian primitive that actually earns its screen time.
- Rules: no position meaning (free placement invites arbitrariness); layouts must be computed (layered Sugiyama-style, top-to-bottom by difficulty); the graph must always have a list alternative (also §5 keyboard requirement).

### 3.3 Cross-links, breadcrumbs, back-nav **[J]**
- Inline topic links in lesson prose use a distinct style (dotted underline + small node glyph) so "link to a concept" ≠ "link to a web thing"; hover shows a concept-preview card (name, difficulty, your mastery).
- Breadcrumbs mirror *content hierarchy* (`Explore / ML core / Transformers / Attention`), not visit history, for Lessons/Topics/Problems; nav pages (Dashboard/Progress) skip breadcrumbs.
- Back-navigation: lesson ← comes from where you entered (use `document.referrer`-style origin param) with an explicit "Up: Attention ← course X" row under the title, and Prev/Next *in curriculum order* at lesson end (OCW/Kahn course-chapter convention) — order from the path the user enrolled in, falling back to syllabus order.

### 3.4 Search & command palette
Single SQLite FTS5 index across topics, lessons, problems, resources (titles, prose, tags). Pattern **[J]**: ⌘K palette with modes — type-to-search (results grouped by entity type, keyboard-driven, `↑↓`+Enter, `Tab` to preview), `>` prefix for commands ("mark lesson complete", "toggle theme", "open admin"), `#` for tags. Search-as-a-page (`/search?q=`) for exhaustive results with filters. Command palette is the strongest "serious tool" signal a keyboard-first audience gets; its absence is the strongest "demo app" tell.

---

## 4. Learning-experience mechanics

### 4.1 A defensible mastery model — no XP **[J, grounded in §1.2]**
Why not XP **[J]**: XP rewards presence, is farmable (Brilliant and Khan both had to design it out — Khan's public switch from mastery points to separate energy points, §1.2), and forces a single scalar over a multidimensional state ("I can compute a gradient" vs "I can explain why"). We show mastery as *state per topic*, not points in aggregate.

Per-topic mastery ∈ {Not started, Aware, Developing, Proficient, Strong} (5 levels, displayed as fill + label, never color-only):
- **Signals & weights** (all logged events): lesson completed-with-checks (+minor, caps at Aware), exercise results weighted by *hint tier used* (clean solve ≫ solved after hint 3 ≫ solution-viewed: solution-viewed alone contributes ~zero), spaced re-validation (later exercises that require this topic as hidden prerequisite: strongest signal, per Khan's mastery-challenge idea and the testing effect), self-reported reset ("I forgot this"), and *nothing* from raw time-on-task or page views. Time-on-task is recorded but lives only in Progress → time analytics, deliberately disconnected from mastery — that's the Khan lesson applied.
- **Level rule**: Proficient requires ≥3 correct independent demonstrations across ≥2 distinct problems with ≥1 day between them (Khan's "consistent correctness across challenges" analog). Strong requires a path-level capstone referencing it.
- **Decay**: no passive decay (cruel and unverifiable with local data). Instead **staleness** at the display layer: any Proficient-or-below topic untouched (no dependent exercise, no review problem) for 90 days gets a "may need revalidation" flag and enters the Arena's suggested-review queue. Touching it via a passed review clears the flag.
- **Opacity requirement**: every level chip has "why?" → the 3–5 contributing events with dates. A mastery number the learner can't audit is gamification, not assessment.

### 4.2 Dashboard for a returning learner **[J]**
Anti-goal: the "empty dashboard" (4 big-number stat cards + a chart of nothing). Dashboard answers, in order: (1) **Continue** — one hero card: next lesson/problem + the *why* ("Attention mechanisms — you finished embeddings; this is the next step of Path: Transformers"), with est. time and a progress bar; (2) **Due & waiting** — revalidation problems (§4.1), open Arena attempts with new hint progress, mentored feedback if any; (3) **This week** — minutes studied, problems attempted/solved, topics touched: three *small* inline stats sharing one row, never three hero cards; (4) **Path rail** — each enrolled path's 1-line position; (5) **Discover** — one Research finding + two cross-topic recommendations from the graph frontier (topics whose prereqs you're Strong in). All above are backed by real local events on day one; anything that can't be is cut.

### 4.3 Lesson page composition **[J]**
Header (topic breadcrumbs, title, difficulty chip, est. time, mastery chip with "why"). Two columns ≥1024px: TOC rail (left, scroll-spy) + content (max 72ch). Body blocks in 3B1B-derived grammar (§1.3): intuition probe → concept prose with typed callouts (Definition/Theorem/Pitfall/Key idea) → worked examples with math → interactive widget(s) with "try it" strip → summary (fixed "TL;DR" block, 3 bullets) → **checks** (2–5 embedded Arena problems inline, 120-item ExerciseEmbed contract) → prerequisites recap (links + your mastery) → further reading (Resources chips) → references numbered.
Footer: prev/next (curriculum order, with titles not arrows only), completion control = explicit primary button "Mark lesson complete", enabled only when required checks pass (see anti-pattern §6), gated with an inline message when not. Reading progress: thin top scroll bar (not a fake %. No scroll-tracking claims — we measure what we can: page-open and interaction events). Notes: per-lesson private notes panel (drawer), supporting `>>quote-then-note` on selection — the micrograd-era learners annotate, and quote-notes are Obsidian/Readwise behavior people expect **[J]**. Bookmarks = star any block, collected in Profile.

### 4.4 Problem Arena UX **[J, from §1.5 + §1.9 + §1.16]**
Problem page: statement (real context, given/asked, constraints), difficulty + topics chips + est. time, math/code rendered with lesson components; environment (run-button for code problems or worksheet for paper-and-pencil ones with declared tools — "pen allowed"). **No "Show answer" button.** Instead a **HintLadder**: hints ordered by 1) restate-the-question nudge, 2) relevant concept pointer (links the exact lesson section), 3) strategy sketch, 4) key step/lemma, 5) full solution — each tier is a click deeper, each click *stamps the submission record*. Attempt history: table of submissions (timestamp, verdict, per-case results à la Exercism, hints used) — reopenable, diffable between your own attempts; the history itself is Progress data. Grading: per-test-case pass/fail with messages, not binary. After full-solution view, problem enters "solution-seen" state → guaranteed re-attempt (variant or same) scheduled before the topic can reach Strong. Math-proof problems get a "compare with reference proof" structured reveal (folded steps) rather than runtime checks.
Teach-without-answering rule (Enlighten-style, adopted as content spec **[J]**): every hint tier must be authored to *reusable principle*, and tier ≤3 must never contain problem-specific numerals/identifiers copied from the statement.

### 4.5 Research & Discover **[J, from §1.16]**
Default view = AI-Index-flavored findings feed ("what's new/what matters", each finding linked to topic slugs and resource entities), secondary views: topic map with resource density (which parts of the curriculum have thin references — useful for me *and* for Admin backlog), saved/bookmarked resources with notes. Never a live-scraping fake: content is curated static data seeded locally; "as of" dates shown.

---

## 5. Accessibility & responsive — the checklist

Formal basis: WCAG 2.1 AA (https://www.w3.org/TR/WCAG21/) and, where stricter, WCAG 2.2 target-size (https://www.w3.org/TR/WCAG22/#target-size-minimum). Applied to this app **[J]**:
- **Contrast**: body text ≥4.5:1, ≥24px/bold-19px text ≥3:1, icons/borders that convey state ≥3:1 (1.4.3/1.4.11). Muted-gray-on-white is where "premium" palettes die: set `--text-secondary` floor at 7:1 on `--bg-base`, and audit `--text-muted` ≥4.5:1. Focus ring: 3:1 against adjacent colors.
- **Keyboard**: Tab order = visual order; all actions reachable. **Graph**: canvas mode is an enhancement; ship a parallel keyboard-navigable tree/list with identical routes (nodes as links, arrow-key traversal in the panel view). Never a mouse-only canvas. Lesson TOC scroll-spy links are real anchors; HintLadder is a listbox with `↑↓`; command palette fully keyboard (⌘K/↑↓/Enter/Esc returns focus to origin).
- **Focus management**: modal open → focus moved in, Tab trapped, Esc closes, focus returns to opener (WAI-ARIA modal pattern, https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). Toasts polite-live region, never steal focus. Route change → focus document title (Vite router: set `document.title` per route).
- **Headings**: one `h1` per page; lesson sections follow heading-order (1.3.1/2.4.6). TOC uses `nav aria-label="Table of contents"`. Callout labels ("Theorem 3.2") are real headings or `<dfn>`/paragraph+aria, not styled `div`s.
- **Math a11y**: KaTeX emits its own MathML (`output: "htmlAndMathml"` — supported option, https://katex.org/docs/options.html); modern screen readers (NVDA+SpeakEquation, VoiceOver MathML) read it. Belt-and-braces: give display equations an `aria-label` of a plain-language rendering authored in content ("natural logarithm of p squared over q") — this doubles as alt text. Every figure gets `alt`; interactive demos get a text description + "results also shown as a table" toggle **[J]**.
- **Motion**: respect `prefers-reduced-motion: reduce` — kill graph force-animation, page transitions, count-ups; scroll-spy remains. No autoplaying lesson audio. (WCAG 2.3.3 + general practice.)
- **Targets**: ≥24×24 CSS px minimum (WCAG 2.2 AA 2.5.7), 44px for anything in a lesson flow or Arena buttons; spacing between targets ≥8px.
- **Color-blind safety**: mastery ramp = luminance ramp + fill pattern (outline/half/solid) + always a text label; error/success paired with icons (1.4.1 Use of Color). Verify in deuteranopia/protanopia simulation before shipping the palette.

**Responsive strategy [J]** — a data-dense app, not a marketing site:
- ≥1280: two-column lessons (TOC rail), graph pane + side panel.
- 768–1279: TOC becomes collapsible "On this page" popover; graph pane → half-height panel under tree; sidebar → icon rail.
- <768: single column; nav = bottom bar (Dashboard, Paths, Arena, Progress, Menu); breadcrumbs truncate to last two segments + "up" button; **keep**: lesson prose, math (horizontal-scroll inside equation cards, never clip mid-fraction), code blocks (scroll), HintLadder (vertical list), problem statement, Continue card. **Collapse**: local graph → prerequisite chips list; path-graph viz → ordered list; Admin tables → card forms. No feature is phone-only-inaccessible: tree/notes/attempts all usable, graphs downgraded to lists.

---

## 6. Anti-patterns (explicit ban list)

1. **Generic SaaS-template look**: hero gradient + three identical feature cards + shadow-on-everything + Inter-as-only-font at default sizes. Checkable tells: single accent hue missing (rainbow chips), radius uniformity, no empty/error states.
2. **Empty-dashboard statistics**: big number cards with nothing actionable under them. Every stat must be clickable to its constituent records.
3. **Graph-for-decoration**: hairball whole-curriculum graph as default view (Obsidian's own usage data pattern says global graph ≠ navigation, §1.12).
4. **Fake live data / "trending" chrome** on a local offline app — invented activity reads as cargo cult.
5. **Card soup**: cards used where a list row, table, or prose paragraph is correct. Card = things you click as units; content sections are not units.
6. **Walls of unstructured text without typed blocks**: long lesson prose without definition/theorem/pitfall/summary cadence (Distill/3B1B exist precisely as the antidote).
7. **Auto-complete on view**: lessons marked done by scroll or dwell — Khan's video-points era showed why; §4.1 forbids it.
8. **XP/streaks as headline metric**: streaks are retention candy that punishes rest; if a streak exists it's cosmetic and unbreakable-feeling (day-gap tolerant), never on the Dashboard hero.
9. **"Show solution" as a single toggle**: collapses the graded-hint pedagogy (§4.4) and pollutes mastery data.
10. **Progress bars without state semantics**: a bar that means "% of videos clicked" is a lie about learning.
11. **Modals for content** (topic detail that should be a route) — kills back-nav and shareable URLs, and hides the app from history.
12. **Notebook chrome cosplay**: cell borders/run buttons on finished lessons (§1.17 — author format ≠ publish format).
13. **Placeholder empty states**: "No problems yet." with no CTA. Empty states are the next-action screen.
14. **Enrollment theater**: fake "enroll" counts/leaderboards in a local app — instead make enrollment *functional* (seeds paths, sets lesson order).
15. **Dark mode as afterthought** (inverted colors, shadow-heavy) — auditable via contrast check on every token pair.

---

## 7. Prioritized top-15 features by "feels like a serious product" impact **[J]**

1. Lesson page with typed content blocks (Definition/Theorem/Pitfall/Key idea/Summary) + stable anchor numbering — the core reading experience (§2.5).
2. ⌘K command palette + unified FTS search across all entities (§3.4).
3. Continue-on-dashboard hero card with real next-step derivation (§4.2).
4. Problem Arena HintLadder + per-case results + attempt history (§4.4) — Exercism-grade.
5. Mastery model with auditable "why this level?" (§4.1).
6. Real Prev/Next + breadcrumbs + curriculum-order syllabus rails (§3.3).
7. Explore AI tree-first with local graph on every topic (§3.2).
8. KaTeX done right: display numbering, plain-language labels per equation, MathML output (§5).
9. Type system (serif prose + Plex UI + mono) with 72ch measure — cheapest premium lever (§2.1).
10. Explicit completion control gated on checks; visible lesson progress bar (§4.3, §6.7).
11. Light/dark themes from token maps, contrast-audited (§2.2).
12. Empty/error/loading states for every list and panel, designed once as shared components (§2.4).
13. Quote-and-note on any content block, exported to Markdown from Settings.
14. Progress views: topic mastery grid + learning-time analytics (time kept *away* from mastery, §4.1).
15. Time estimates (lesson/path/problem) shown everywhere duration matters (§1.8).
Stretch after these: interactive figure widget framework (§2.5), Research findings feed, graph poster view, mobile bottom-nav refinement.

## 8. Recommendations we deliberately reject, and why
- **Infinite canvas / whiteboard IA (Miro)** for the curriculum — free placement makes a designed syllabus look accidental (§1.13).
- **Video-first lessons (Coursera-style shells)** — a local text/KaTeX product's edge is reading; video is one resource type, not the spine.
- **Energy/XP/level currency** — farmable, mixes engagement with assessment (the Khan retreat, §1.2).
- **Whole-curriculum force-directed graph as primary Explore UI** — hairball; hierarchy-first (§3.2).
- **Social features invented for parity** (feed, live leaderboard, "12,000 students enrolled") — fake data in a local app erodes trust (§6.4).
- **Passive mastery decay** — unverifiable locally; staleness+revalidation instead (§4.1).
- **Auto-mark-complete on scroll/dwell** — corrupts every downstream signal (§6.7).
- **Notebook-cell lesson UI (raw Colab/Observable chrome)** — publish format ≠ author format (§1.17).
- **Streak-first motivation design** — punitive for adults with irregular time; cosmetic at most (§6.8).

## Verification notes
- Khan Academy support articles returned 403 to direct fetch; mastery-system facts cross-checked via search-result snippets of https://support.khanacademy.org/hc/en-us/articles/115002552631 and public khan-for-educators pages; treat exact wording ("Attempted/Familiar/Proficient/Mastered") as high-confidence but not re-verified line-for-line.
- Sander Dieleman's "The Atlas of AI" essay: existence well-known, current URL could not be verified this session — excluded from UI copy suggestions.
- Kaggle Learn and edX/Coursera listing pages are JS-rendered; patterns stated above from long-standing product behavior, flagged where relied upon.
- Everything else above was fetched this session from the cited URL.
