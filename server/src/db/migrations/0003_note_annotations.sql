-- Note annotations: quote-then-note and block anchoring.
-- Added as a new migration rather than editing 0001, which is already applied and checksummed.

ALTER TABLE user_notes ADD COLUMN quote TEXT NOT NULL DEFAULT '';

ALTER TABLE user_notes ADD COLUMN block_id INTEGER REFERENCES lesson_blocks(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notes_lesson ON user_notes(user_id, lesson_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_notes_topic ON user_notes(user_id, topic_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_notes_resource ON user_notes(user_id, resource_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_notes_course ON user_notes(user_id, course_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_bookmarks_lesson ON user_lesson_bookmarks(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_bookmarks_topic ON user_topic_bookmarks(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_bookmarks_resource ON user_resource_bookmarks(user_id, created_at);
