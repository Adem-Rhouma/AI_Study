-- AI Mastery — migration 0001: core schema
-- SQLite (better-sqlite3). All FKs enforced; PRAGMAs set in db/connection.ts.
-- Conventions:
--   * integer autoincrement PKs internally; stable public `slug` where user-facing.
--   * timestamps are ISO-8601 UTC text.
--   * ordered string lists live in JSON columns (validated at the edge); anything with an
--     identity or a cross-reference is a real table. See docs/adr/0004-json-columns.md.

PRAGMA foreign_keys = ON;

-- ============================================================ users & auth

CREATE TABLE users (
  id                INTEGER PRIMARY KEY,
  email             TEXT    NOT NULL UNIQUE CHECK (length(email) BETWEEN 3 AND 254),
  password_hash     TEXT    NOT NULL,
  display_name      TEXT    NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  role              TEXT    NOT NULL DEFAULT 'learner'
                          CHECK (role IN ('learner','author','admin')),
  bio               TEXT,
  avatar_url        TEXT,
  is_active         INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  failed_logins     INTEGER NOT NULL DEFAULT 0,
  locked_until      TEXT,
  created_at        TEXT    NOT NULL,
  updated_at        TEXT    NOT NULL,
  last_login_at     TEXT
);
CREATE INDEX idx_users_role ON users(role);

CREATE TABLE sessions (
  id            TEXT    PRIMARY KEY,               -- sha256 hex of the cookie token
  user_id       TEXT    NOT NULL,
  created_at    TEXT    NOT NULL,
  last_seen_at  TEXT    NOT NULL,
  expires_at    TEXT    NOT NULL,
  ip_prefix     TEXT,
  user_agent    TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE password_resets (
  id          TEXT    PRIMARY KEY,                 -- sha256 hex of the emailed token
  user_id     INTEGER NOT NULL,
  created_at  TEXT    NOT NULL,
  expires_at  TEXT    NOT NULL,
  used_at     TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_resets_user ON password_resets(user_id);

CREATE TABLE user_preferences (
  user_id               INTEGER PRIMARY KEY,
  theme                 TEXT    NOT NULL DEFAULT 'system'
                              CHECK (theme IN ('light','dark','system')),
  reduced_motion        INTEGER NOT NULL DEFAULT 0 CHECK (reduced_motion IN (0,1)),
  ui_density            TEXT    NOT NULL DEFAULT 'comfortable'
                              CHECK (ui_density IN ('comfortable','compact')),
  daily_goal_minutes    INTEGER NOT NULL DEFAULT 20 CHECK (daily_goal_minutes BETWEEN 0 AND 600),
  default_difficulty    TEXT    NOT NULL DEFAULT 'intermediate'
                              CHECK (default_difficulty IN ('introductory','beginner','intermediate','advanced','expert')),
  show_solutions_by_default INTEGER NOT NULL DEFAULT 0 CHECK (show_solutions_by_default IN (0,1)),
  ai_assistant_enabled  INTEGER NOT NULL DEFAULT 1 CHECK (ai_assistant_enabled IN (0,1)),
  updated_at            TEXT    NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================ curriculum taxonomy

CREATE TABLE domains (
  id          INTEGER PRIMARY KEY,
  slug        TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  summary     TEXT    NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);
CREATE INDEX idx_domains_order ON domains(order_index);

CREATE TABLE subdomains (
  id          INTEGER PRIMARY KEY,
  domain_id   INTEGER NOT NULL,
  slug        TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  summary     TEXT    NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL,
  FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
);
CREATE INDEX idx_subdomains_domain ON subdomains(domain_id, order_index);

CREATE TABLE topics (
  id                INTEGER PRIMARY KEY,
  subdomain_id      INTEGER NOT NULL,
  slug              TEXT    NOT NULL UNIQUE,
  name              TEXT    NOT NULL,
  difficulty        TEXT    NOT NULL DEFAULT 'intermediate'
                          CHECK (difficulty IN ('introductory','beginner','intermediate','advanced','expert')),
  definition        TEXT    NOT NULL DEFAULT '',
  explanation       TEXT    NOT NULL DEFAULT '',
  learning_objectives JSON  NOT NULL DEFAULT '[]',
  key_results       JSON    NOT NULL DEFAULT '[]',
  math_foundations  JSON    NOT NULL DEFAULT '[]',
  applications      JSON    NOT NULL DEFAULT '[]',
  misconceptions    JSON    NOT NULL DEFAULT '[]',
  open_problems     TEXT,
  history_note      TEXT,
  est_minutes       INTEGER NOT NULL DEFAULT 30,
  tags              JSON    NOT NULL DEFAULT '[]',
  status            TEXT    NOT NULL DEFAULT 'published'
                          CHECK (status IN ('draft','review','published','archived')),
  created_at        TEXT    NOT NULL,
  updated_at        TEXT    NOT NULL,
  FOREIGN KEY (subdomain_id) REFERENCES subdomains(id) ON DELETE CASCADE
);
CREATE INDEX idx_topics_subdomain ON topics(subdomain_id);
CREATE INDEX idx_topics_difficulty ON topics(difficulty);
CREATE INDEX idx_topics_status ON topics(status);

CREATE TABLE topic_further_reading (
  id        INTEGER PRIMARY KEY,
  topic_id  INTEGER NOT NULL,
  position  INTEGER NOT NULL DEFAULT 0,
  title     TEXT    NOT NULL,
  authors   TEXT,
  year      INTEGER,
  type      TEXT    NOT NULL DEFAULT 'paper'
                  CHECK (type IN ('book','paper','survey','lecture-notes','course','docs','blog','repository','video')),
  url       TEXT,
  note      TEXT,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX uq_reading_topic_position ON topic_further_reading(topic_id, position);

-- Prerequisite / dependency graph. kind:
--   strict      -> you must know `from` before `to`   (edge direction: to REQUIRES from)
--   recommended -> helpful background
--   related     -> lateral connection, no ordering
--   extension   -> `from` opens up `to` as a deeper direction
CREATE TABLE topic_relations (
  id          INTEGER PRIMARY KEY,
  topic_id    INTEGER NOT NULL,   -- the dependent topic
  requires_id INTEGER NOT NULL,   -- the prerequisite topic
  kind        TEXT    NOT NULL CHECK (kind IN ('strict','recommended','related','extension')),
  note        TEXT,
  UNIQUE (topic_id, requires_id, kind),
  CHECK (topic_id <> requires_id),
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
  FOREIGN KEY (requires_id) REFERENCES topics(id) ON DELETE CASCADE
);
CREATE INDEX idx_relations_topic ON topic_relations(topic_id, kind);
CREATE INDEX idx_relations_requires ON topic_relations(requires_id, kind);

CREATE TABLE tags (
  id   INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE topic_tags (
  topic_id INTEGER NOT NULL,
  tag_id   INTEGER NOT NULL,
  PRIMARY KEY (topic_id, tag_id),
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
CREATE INDEX idx_topic_tags_tag ON topic_tags(tag_id);

-- ============================================================ learning paths

CREATE TABLE learning_paths (
  id            INTEGER PRIMARY KEY,
  slug          TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,
  summary       TEXT    NOT NULL DEFAULT '',
  description   TEXT    NOT NULL DEFAULT '',
  audience      TEXT    NOT NULL DEFAULT '',
  difficulty    TEXT    NOT NULL DEFAULT 'intermediate'
                    CHECK (difficulty IN ('introductory','beginner','intermediate','advanced','expert')),
  est_hours     INTEGER NOT NULL DEFAULT 40,
  objectives    JSON    NOT NULL DEFAULT '[]',
  completion_criteria TEXT NOT NULL DEFAULT '',
  prerequisites_note  TEXT    NOT NULL DEFAULT '',
  outcome_note        TEXT    NOT NULL DEFAULT '',
  status        TEXT    NOT NULL DEFAULT 'published'
                    CHECK (status IN ('draft','published','archived')),
  is_featured   INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0,1)),
  order_index   INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);
CREATE INDEX idx_paths_status_order ON learning_paths(status, order_index);

CREATE TABLE learning_path_stages (
  id          INTEGER PRIMARY KEY,
  path_id     INTEGER NOT NULL,
  title       TEXT    NOT NULL,
  summary     TEXT    NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (path_id) REFERENCES learning_paths(id) ON DELETE CASCADE
);
CREATE INDEX idx_path_stages ON learning_path_stages(path_id, order_index);

CREATE TABLE learning_path_topics (
  id          INTEGER PRIMARY KEY,
  path_id     INTEGER NOT NULL,
  topic_id    INTEGER NOT NULL,
  stage_id    INTEGER,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_optional INTEGER NOT NULL DEFAULT 0 CHECK (is_optional IN (0,1)),
  note        TEXT,
  UNIQUE (path_id, topic_id),
  FOREIGN KEY (path_id) REFERENCES learning_paths(id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
  FOREIGN KEY (stage_id) REFERENCES learning_path_stages(id) ON DELETE SET NULL
);
CREATE INDEX idx_path_topics_path ON learning_path_topics(path_id, order_index);

CREATE TABLE learning_path_courses (
  id          INTEGER PRIMARY KEY,
  path_id     INTEGER NOT NULL,
  course_id   INTEGER NOT NULL,
  stage_id    INTEGER,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_optional INTEGER NOT NULL DEFAULT 0 CHECK (is_optional IN (0,1)),
  UNIQUE (path_id, course_id),
  FOREIGN KEY (path_id) REFERENCES learning_paths(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (stage_id) REFERENCES learning_path_stages(id) ON DELETE SET NULL
);
-- courses is declared later in this file; SQLite resolves FK targets at DML time, not DDL time.
CREATE INDEX idx_path_courses_path ON learning_path_courses(path_id, order_index);

-- ============================================================ courses & lessons

CREATE TABLE courses (
  id            INTEGER PRIMARY KEY,
  slug          TEXT    NOT NULL UNIQUE,
  title         TEXT    NOT NULL,
  subtitle      TEXT    NOT NULL DEFAULT '',
  summary       TEXT    NOT NULL DEFAULT '',
  difficulty    TEXT    NOT NULL DEFAULT 'intermediate'
                    CHECK (difficulty IN ('introductory','beginner','intermediate','advanced','expert')),
  status        TEXT    NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','review','published','archived')),
  est_hours     REAL    NOT NULL DEFAULT 4,
  author        TEXT    NOT NULL DEFAULT 'AI Mastery',
  audience      TEXT    NOT NULL DEFAULT '',
  objectives    JSON    NOT NULL DEFAULT '[]',
  prerequisites_note TEXT NOT NULL DEFAULT '',
  completion_criteria TEXT NOT NULL DEFAULT '',
  is_featured   INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0,1)),
  order_index   INTEGER NOT NULL DEFAULT 0,
  created_by    INTEGER,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_courses_status ON courses(status, order_index);

CREATE TABLE course_topics (
  course_id INTEGER NOT NULL,
  topic_id  INTEGER NOT NULL,
  PRIMARY KEY (course_id, topic_id),
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);
CREATE INDEX idx_course_topics_topic ON course_topics(topic_id);

CREATE TABLE course_modules (
  id          INTEGER PRIMARY KEY,
  course_id   INTEGER NOT NULL,
  title       TEXT    NOT NULL,
  summary     TEXT    NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);
CREATE INDEX idx_modules_course ON course_modules(course_id, order_index);

CREATE TABLE lessons (
  id            INTEGER PRIMARY KEY,
  course_id     INTEGER NOT NULL,
  module_id     INTEGER,
  slug          TEXT    NOT NULL UNIQUE,
  title         TEXT    NOT NULL,
  summary       TEXT    NOT NULL DEFAULT '',
  order_index   INTEGER NOT NULL DEFAULT 0,
  status        TEXT    NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','review','published','archived')),
  est_minutes   INTEGER NOT NULL DEFAULT 15,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (module_id) REFERENCES course_modules(id) ON DELETE SET NULL
);
CREATE INDEX idx_lessons_course ON lessons(course_id, order_index);
CREATE INDEX idx_lessons_status ON lessons(status);

-- Typed, ordered content blocks. `text` holds the primary body (markdown or LaTeX source
-- for math blocks); `payload` holds block-type-specific config validated per block type.
CREATE TABLE lesson_blocks (
  id          INTEGER PRIMARY KEY,
  lesson_id   INTEGER NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  type        TEXT    NOT NULL CHECK (type IN (
                  'heading','prose','list','callout','math','derivation','worked_example',
                  'definition','theorem','code','exercise','quiz','image','table','quote',
                  'interactive','comparison','timeline','reference','checklist','tabs')),
  text        TEXT    NOT NULL DEFAULT '',
  payload     JSON    NOT NULL DEFAULT '{}',
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
)
;
CREATE INDEX idx_blocks_lesson ON lesson_blocks(lesson_id, order_index);

CREATE TABLE lesson_revisions (
  id         INTEGER PRIMARY KEY,
  lesson_id  INTEGER NOT NULL,
  edited_by  INTEGER,
  created_at TEXT    NOT NULL,
  snapshot   JSON    NOT NULL,
  note       TEXT,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
  FOREIGN KEY (edited_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_revisions_lesson ON lesson_revisions(lesson_id, created_at);

CREATE TABLE lesson_topics (
  lesson_id INTEGER NOT NULL,
  topic_id  INTEGER NOT NULL,
  PRIMARY KEY (lesson_id, topic_id),
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);
CREATE INDEX idx_lesson_topics_topic ON lesson_topics(topic_id);

CREATE TABLE lesson_references (
  id        INTEGER PRIMARY KEY,
  lesson_id INTEGER NOT NULL,
  position  INTEGER NOT NULL DEFAULT 0,
  title     TEXT    NOT NULL,
  authors   TEXT,
  year      INTEGER,
  type      TEXT    NOT NULL DEFAULT 'paper'
                CHECK (type IN ('book','paper','survey','lecture-notes','course','docs','blog','repository','video')),
  url       TEXT,
  note      TEXT,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);
CREATE INDEX idx_lesson_refs ON lesson_references(lesson_id, position);

-- ============================================================ exercises

CREATE TABLE exercises (
  id             INTEGER PRIMARY KEY,
  slug           TEXT    NOT NULL UNIQUE,
  kind           TEXT    NOT NULL CHECK (kind IN (
                     'single_choice','multi_choice','true_false','numeric','short_answer',
                     'expression','derivation','code','match')),
  topic_id       INTEGER,
  lesson_id      INTEGER,
  difficulty     TEXT    NOT NULL DEFAULT 'intermediate'
                     CHECK (difficulty IN ('introductory','beginner','intermediate','advanced','expert')),
  points         INTEGER NOT NULL DEFAULT 10,
  title          TEXT    NOT NULL,
  prompt         TEXT    NOT NULL DEFAULT '',
  context        TEXT    NOT NULL DEFAULT '',
  answer_spec    JSON    NOT NULL DEFAULT '{}',
  solution       TEXT    NOT NULL DEFAULT '',
  explanation    TEXT    NOT NULL DEFAULT '',
  answer_note    TEXT    NOT NULL DEFAULT '',
  status         TEXT    NOT NULL DEFAULT 'published'
                     CHECK (status IN ('draft','published','archived')),
  created_by     INTEGER,
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_exercises_topic ON exercises(topic_id);
CREATE INDEX idx_exercises_difficulty ON exercises(difficulty, kind);
CREATE INDEX idx_exercises_status ON exercises(status);

CREATE TABLE exercise_options (
  id          INTEGER PRIMARY KEY,
  exercise_id INTEGER NOT NULL,
  label       TEXT    NOT NULL,
  text        TEXT    NOT NULL,
  is_correct  INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0,1)),
  position    INTEGER NOT NULL DEFAULT 0,
  feedback    TEXT,
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
);
CREATE INDEX idx_options_exercise ON exercise_options(exercise_id, position);

CREATE TABLE exercise_hints (
  id          INTEGER PRIMARY KEY,
  exercise_id INTEGER NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  text        TEXT    NOT NULL,
  UNIQUE (exercise_id, position),
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
);

CREATE TABLE exercise_topics (
  exercise_id INTEGER NOT NULL,
  topic_id    INTEGER NOT NULL,
  PRIMARY KEY (exercise_id, topic_id),
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);
CREATE INDEX idx_exercise_topics_topic ON exercise_topics(topic_id);

CREATE TABLE exercise_tags (
  exercise_id INTEGER NOT NULL,
  tag_id      INTEGER NOT NULL,
  PRIMARY KEY (exercise_id, tag_id),
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE exercise_attempts (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL,
  exercise_id      INTEGER NOT NULL,
  submitted        JSON    NOT NULL DEFAULT '{}',
  is_correct       INTEGER,            -- NULL = awaiting manual review (open-ended kinds)
  score            REAL    NOT NULL DEFAULT 0,
  hints_used       INTEGER NOT NULL DEFAULT 0,
  attempt_index    INTEGER NOT NULL DEFAULT 1,
  duration_seconds INTEGER,
  feedback         TEXT    NOT NULL DEFAULT '',
  created_at       TEXT    NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
);
CREATE INDEX idx_attempts_user ON exercise_attempts(user_id, created_at);
CREATE INDEX idx_attempts_exercise ON exercise_attempts(exercise_id);

-- ============================================================ resources & collections

CREATE TABLE resources (
  id             INTEGER PRIMARY KEY,
  slug           TEXT    NOT NULL UNIQUE,
  title          TEXT    NOT NULL,
  description    TEXT    NOT NULL DEFAULT '',
  type           TEXT    NOT NULL CHECK (type IN (
                     'paper','book','survey','course','video','docs','repository',
                     'tutorial','dataset','tool','lecture-notes','blog','standard')),
  url            TEXT    NOT NULL,
  authors        TEXT    NOT NULL DEFAULT '',
  publisher      TEXT    NOT NULL DEFAULT '',
  published_year INTEGER,
  source_name    TEXT    NOT NULL DEFAULT '',
  difficulty     TEXT    NOT NULL DEFAULT 'intermediate'
                     CHECK (difficulty IN ('introductory','beginner','intermediate','advanced','expert')),
  est_minutes    INTEGER,
  is_curated     INTEGER NOT NULL DEFAULT 1 CHECK (is_curated IN (0,1)),
  verified       INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
  status         TEXT    NOT NULL DEFAULT 'published'
                     CHECK (status IN ('draft','published','archived')),
  added_by       INTEGER,
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL,
  FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_resources_type ON resources(type, difficulty);
CREATE INDEX idx_resources_status ON resources(status);

CREATE TABLE resource_topics (
  resource_id INTEGER NOT NULL,
  topic_id    INTEGER NOT NULL,
  PRIMARY KEY (resource_id, topic_id),
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);
CREATE INDEX idx_resource_topics_topic ON resource_topics(topic_id);

CREATE TABLE resource_tags (
  resource_id INTEGER NOT NULL,
  tag_id      INTEGER NOT NULL,
  PRIMARY KEY (resource_id, tag_id),
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE curated_collections (
  id          INTEGER PRIMARY KEY,
  slug        TEXT    NOT NULL UNIQUE,
  title       TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  kind        TEXT    NOT NULL DEFAULT 'reading-list'
                  CHECK (kind IN ('reading-list','research-topic','must-read','frontier','survey-trail')),
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

CREATE TABLE curated_collection_items (
  collection_id INTEGER NOT NULL,
  resource_id   INTEGER NOT NULL,
  position      INTEGER NOT NULL DEFAULT 0,
  note          TEXT    NOT NULL DEFAULT '',
  PRIMARY KEY (collection_id, resource_id),
  FOREIGN KEY (collection_id) REFERENCES curated_collections(id) ON DELETE CASCADE,
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
);

CREATE TABLE user_collections (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  title       TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  is_public   INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0,1)),
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_user_collections_user ON user_collections(user_id);

CREATE TABLE user_collection_items (
  collection_id INTEGER NOT NULL,
  resource_id   INTEGER NOT NULL,
  position      INTEGER NOT NULL DEFAULT 0,
  note          TEXT    NOT NULL DEFAULT '',
  PRIMARY KEY (collection_id, resource_id),
  FOREIGN KEY (collection_id) REFERENCES user_collections(id) ON DELETE CASCADE,
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
);

-- ============================================================ competitions & milestones

CREATE TABLE competitions (
  id             INTEGER PRIMARY KEY,
  slug           TEXT    NOT NULL UNIQUE,
  name           TEXT    NOT NULL,
  organizer      TEXT    NOT NULL DEFAULT '',
  type           TEXT    NOT NULL DEFAULT 'competition'
                     CHECK (type IN ('competition','challenge','hackathon','conference','workshop','grant','summit')),
  url            TEXT    NOT NULL,
  summary        TEXT    NOT NULL DEFAULT '',
  requirements   TEXT    NOT NULL DEFAULT '',
  skills_practiced TEXT  NOT NULL DEFAULT '',
  difficulty     TEXT    NOT NULL DEFAULT 'intermediate'
                     CHECK (difficulty IN ('introductory','beginner','intermediate','advanced','expert')),
  start_date     TEXT,
  deadline_date  TEXT,
  location       TEXT    NOT NULL DEFAULT '',
  status         TEXT    NOT NULL DEFAULT 'upcoming'
                     CHECK (status IN ('upcoming','open','ongoing','closed','recurring')),
  is_live_data   INTEGER NOT NULL DEFAULT 0 CHECK (is_live_data IN (0,1)),
  source_updated_at TEXT NOT NULL DEFAULT '',
  added_by       INTEGER,
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL,
  FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_competitions_status ON competitions(status, deadline_date);

CREATE TABLE competition_topics (
  competition_id INTEGER NOT NULL,
  topic_id       INTEGER NOT NULL,
  PRIMARY KEY (competition_id, topic_id),
  FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);

CREATE TABLE milestones (
  id           INTEGER PRIMARY KEY,
  occurred_on  TEXT    NOT NULL,
  title        TEXT    NOT NULL,
  summary      TEXT    NOT NULL DEFAULT '',
  kind         TEXT    NOT NULL DEFAULT 'development'
                    CHECK (kind IN ('paper','model','product','dataset','standard','event','development')),
  url          TEXT,
  source_name  TEXT    NOT NULL DEFAULT '',
  topic_id     INTEGER,
  created_at   TEXT    NOT NULL,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL
);
CREATE INDEX idx_milestones_date ON milestones(occurred_on DESC);

-- ============================================================ progress & personalization

CREATE TABLE path_enrollments (
  user_id     INTEGER NOT NULL,
  path_id     INTEGER NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','paused','completed','abandoned')),
  started_at  TEXT    NOT NULL,
  goal_date   TEXT,
  completed_at TEXT,
  PRIMARY KEY (user_id, path_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (path_id) REFERENCES learning_paths(id) ON DELETE CASCADE
);

CREATE TABLE course_enrollments (
  user_id        INTEGER NOT NULL,
  course_id      INTEGER NOT NULL,
  started_at     TEXT    NOT NULL,
  last_lesson_id INTEGER,
  completed_at   TEXT,
  PRIMARY KEY (user_id, course_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (last_lesson_id) REFERENCES lessons(id) ON DELETE SET NULL
);

CREATE TABLE lesson_completions (
  user_id          INTEGER NOT NULL,
  lesson_id        INTEGER NOT NULL,
  source           TEXT    NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','exercise','quiz')),
  max_scroll       REAL    NOT NULL DEFAULT 0,
  last_block_index INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  completed_at     TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL,
  PRIMARY KEY (user_id, lesson_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);
CREATE INDEX idx_completions_user_date ON lesson_completions(user_id, completed_at);

CREATE TABLE activity_log (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  day        TEXT    NOT NULL,             -- YYYY-MM-DD (user-local, see docs/adr/0006)
  action     TEXT    NOT NULL,
  entity_type TEXT,
  entity_id  INTEGER,
  minutes    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_activity_user_day ON activity_log(user_id, day);

CREATE TABLE topic_mastery (
  user_id      INTEGER NOT NULL,
  topic_id     INTEGER NOT NULL,
  coverage     REAL    NOT NULL DEFAULT 0,
  performance  REAL    NOT NULL DEFAULT 0,
  retention    REAL    NOT NULL DEFAULT 0,
  score        REAL    NOT NULL DEFAULT 0,
  level        TEXT    NOT NULL DEFAULT 'new'
                   CHECK (level IN ('new','exposed','learning','practising','proficient','mastered')),
  attempts     INTEGER NOT NULL DEFAULT 0,
  lessons_done INTEGER NOT NULL DEFAULT 0,
  last_touched_at TEXT,
  updated_at   TEXT    NOT NULL,
  PRIMARY KEY (user_id, topic_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);
CREATE INDEX idx_mastery_user_score ON topic_mastery(user_id, score);
CREATE INDEX idx_mastery_topic ON topic_mastery(topic_id);

CREATE TABLE user_lesson_bookmarks (
  user_id    INTEGER NOT NULL,
  lesson_id  INTEGER NOT NULL,
  created_at TEXT    NOT NULL,
  PRIMARY KEY (user_id, lesson_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);

CREATE TABLE user_topic_bookmarks (
  user_id    INTEGER NOT NULL,
  topic_id   INTEGER NOT NULL,
  created_at TEXT    NOT NULL,
  PRIMARY KEY (user_id, topic_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);

CREATE TABLE user_resource_bookmarks (
  user_id     INTEGER NOT NULL,
  resource_id INTEGER NOT NULL,
  created_at  TEXT    NOT NULL,
  PRIMARY KEY (user_id, resource_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
);

CREATE TABLE user_notes (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  lesson_id  INTEGER,
  topic_id   INTEGER,
  resource_id INTEGER,
  course_id  INTEGER,
  body       TEXT    NOT NULL CHECK (length(trim(body)) > 0),
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL,
  CHECK ((
    (CASE WHEN lesson_id   IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN topic_id    IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN resource_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN course_id   IS NOT NULL THEN 1 ELSE 0 END)
  ) = 1),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);
CREATE INDEX idx_notes_user ON user_notes(user_id, updated_at);
CREATE INDEX idx_notes_target ON user_notes(lesson_id, topic_id, resource_id, course_id);

-- ============================================================ AI integration

CREATE TABLE ai_providers (
  id                INTEGER PRIMARY KEY,
  name              TEXT    NOT NULL UNIQUE,
  adapter           TEXT    NOT NULL CHECK (adapter IN ('openai_compatible','anthropic','ollama')),
  base_url          TEXT    NOT NULL DEFAULT '',
  model             TEXT    NOT NULL DEFAULT '',
  api_key_ciphertext TEXT   NOT NULL DEFAULT '',
  api_key_hint      TEXT    NOT NULL DEFAULT '',
  is_enabled        INTEGER NOT NULL DEFAULT 0 CHECK (is_enabled IN (0,1)),
  priority          INTEGER NOT NULL DEFAULT 0,
  temperature       REAL    NOT NULL DEFAULT 0.3,
  max_tokens        INTEGER NOT NULL DEFAULT 900,
  timeout_ms        INTEGER NOT NULL DEFAULT 30000,
  created_at        TEXT    NOT NULL,
  updated_at        TEXT    NOT NULL
);

CREATE TABLE ai_conversations (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL,
  title        TEXT    NOT NULL DEFAULT 'New conversation',
  context_type TEXT    NOT NULL DEFAULT 'general'
                   CHECK (context_type IN ('general','topic','lesson','exercise','path','course')),
  context_id   INTEGER,
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_ai_conversations_user ON ai_conversations(user_id, updated_at);

CREATE TABLE ai_messages (
  id               INTEGER PRIMARY KEY,
  conversation_id  INTEGER NOT NULL,
  role             TEXT    NOT NULL CHECK (role IN ('system','user','assistant')),
  content          TEXT    NOT NULL,
  provider_id      INTEGER,
  model            TEXT,
  tokens_prompt    INTEGER NOT NULL DEFAULT 0,
  tokens_completion INTEGER NOT NULL DEFAULT 0,
  error            TEXT,
  created_at       TEXT    NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES ai_providers(id) ON DELETE SET NULL
);
CREATE INDEX idx_ai_messages_conversation ON ai_messages(conversation_id, id);

CREATE TABLE ai_usage (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER,
  provider_id   INTEGER,
  purpose       TEXT    NOT NULL,
  model         TEXT    NOT NULL DEFAULT '',
  tokens_prompt INTEGER NOT NULL DEFAULT 0,
  tokens_completion INTEGER NOT NULL DEFAULT 0,
  latency_ms    INTEGER NOT NULL DEFAULT 0,
  ok            INTEGER NOT NULL DEFAULT 1 CHECK (ok IN (0,1)),
  created_at    TEXT    NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (provider_id) REFERENCES ai_providers(id) ON DELETE SET NULL
);
CREATE INDEX idx_ai_usage_created ON ai_usage(created_at);

-- ============================================================ misc

CREATE TABLE uploaded_files (
  id          INTEGER PRIMARY KEY,
  key         TEXT    NOT NULL UNIQUE,
  filename    TEXT    NOT NULL,
  mime        TEXT    NOT NULL,
  size_bytes  INTEGER NOT NULL,
  uploaded_by INTEGER,
  created_at  TEXT    NOT NULL,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE app_settings (
  key        TEXT PRIMARY KEY,
  value      JSON NOT NULL,
  updated_at TEXT NOT NULL
);
