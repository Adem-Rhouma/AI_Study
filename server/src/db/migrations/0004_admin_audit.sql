-- 0004: the audit trail the Content Studio writes.
--
-- activity_log is a learner's study feed (minutes, day buckets); staff edits to curriculum are a
-- different thing and are answered by a different question ("what changed and who did it"), so they
-- get their own table. The actor's name is copied in rather than joined: deleting an account must
-- not erase the record that the account made the change.

CREATE TABLE content_changes (
  id          INTEGER PRIMARY KEY,
  actor_id    INTEGER,
  actor_name  TEXT    NOT NULL DEFAULT '',
  kind        TEXT    NOT NULL,
  entity_id   INTEGER,
  entity_ref  TEXT    NOT NULL DEFAULT '',
  action      TEXT    NOT NULL CHECK (action IN ('create','update','delete','status','provider','user')),
  summary     TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL,
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_content_changes_created ON content_changes(created_at DESC, id DESC);
CREATE INDEX idx_content_changes_kind ON content_changes(kind, entity_id);
