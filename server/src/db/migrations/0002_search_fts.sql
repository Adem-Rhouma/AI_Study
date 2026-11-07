-- AI Mastery — migration 0002: full-text search (FTS5) with external-content indexes.
-- Indexes are kept in sync by triggers so search never reads a stale copy, and the source
-- tables stay normalized. Search ranking uses bm25() with per-column weights.

PRAGMA foreign_keys = ON;

CREATE VIRTUAL TABLE topics_fts USING fts5(
  name,
  definition,
  explanation,
  tags,
  content='topics',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER topics_fts_ai AFTER INSERT ON topics BEGIN
  INSERT INTO topics_fts(rowid, name, definition, explanation, tags)
  VALUES (new.id, new.name, new.definition, new.explanation, new.tags);
END;

CREATE TRIGGER topics_fts_ad AFTER DELETE ON topics BEGIN
  INSERT INTO topics_fts(topics_fts, rowid, name, definition, explanation, tags)
  VALUES ('delete', old.id, old.name, old.definition, old.explanation, old.tags);
END;

CREATE TRIGGER topics_fts_au AFTER UPDATE ON topics BEGIN
  INSERT INTO topics_fts(topics_fts, rowid, name, definition, explanation, tags)
  VALUES ('delete', old.id, old.name, old.definition, old.explanation, old.tags);
  INSERT INTO topics_fts(rowid, name, definition, explanation, tags)
  VALUES (new.id, new.name, new.definition, new.explanation, new.tags);
END;

CREATE VIRTUAL TABLE lessons_fts USING fts5(
  title,
  summary,
  content='lessons',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER lessons_fts_ai AFTER INSERT ON lessons BEGIN
  INSERT INTO lessons_fts(rowid, title, summary) VALUES (new.id, new.title, new.summary);
END;
CREATE TRIGGER lessons_fts_ad AFTER DELETE ON lessons BEGIN
  INSERT INTO lessons_fts(lessons_fts, rowid, title, summary)
  VALUES ('delete', old.id, old.title, old.summary);
END;
CREATE TRIGGER lessons_fts_au AFTER UPDATE ON lessons BEGIN
  INSERT INTO lessons_fts(lessons_fts, rowid, title, summary)
  VALUES ('delete', old.id, old.title, old.summary);
  INSERT INTO lessons_fts(rowid, title, summary) VALUES (new.id, new.title, new.summary);
END;

-- Lesson bodies live in lesson_blocks, so they get their own index; search joins back to lessons.
CREATE VIRTUAL TABLE blocks_fts USING fts5(
  text,
  content='lesson_blocks',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER blocks_fts_ai AFTER INSERT ON lesson_blocks BEGIN
  INSERT INTO blocks_fts(rowid, text) VALUES (new.id, new.text);
END;
CREATE TRIGGER blocks_fts_ad AFTER DELETE ON lesson_blocks BEGIN
  INSERT INTO blocks_fts(blocks_fts, rowid, text) VALUES ('delete', old.id, old.text);
END;
CREATE TRIGGER blocks_fts_au AFTER UPDATE ON lesson_blocks BEGIN
  INSERT INTO blocks_fts(blocks_fts, rowid, text) VALUES ('delete', old.id, old.text);
  INSERT INTO blocks_fts(rowid, text) VALUES (new.id, new.text);
END;

CREATE VIRTUAL TABLE resources_fts USING fts5(
  title,
  description,
  authors,
  publisher,
  content='resources',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER resources_fts_ai AFTER INSERT ON resources BEGIN
  INSERT INTO resources_fts(rowid, title, description, authors, publisher)
  VALUES (new.id, new.title, new.description, new.authors, new.publisher);
END;
CREATE TRIGGER resources_fts_ad AFTER DELETE ON resources BEGIN
  INSERT INTO resources_fts(resources_fts, rowid, title, description, authors, publisher)
  VALUES ('delete', old.id, old.title, old.description, old.authors, old.publisher);
END;
CREATE TRIGGER resources_fts_au AFTER UPDATE ON resources BEGIN
  INSERT INTO resources_fts(resources_fts, rowid, title, description, authors, publisher)
  VALUES ('delete', old.id, old.title, old.description, old.authors, old.publisher);
  INSERT INTO resources_fts(rowid, title, description, authors, publisher)
  VALUES (new.id, new.title, new.description, new.authors, new.publisher);
END;

CREATE VIRTUAL TABLE exercises_fts USING fts5(
  title,
  prompt,
  context,
  content='exercises',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER exercises_fts_ai AFTER INSERT ON exercises BEGIN
  INSERT INTO exercises_fts(rowid, title, prompt, context)
  VALUES (new.id, new.title, new.prompt, new.context);
END;
CREATE TRIGGER exercises_fts_ad AFTER DELETE ON exercises BEGIN
  INSERT INTO exercises_fts(exercises_fts, rowid, title, prompt, context)
  VALUES ('delete', old.id, old.title, old.prompt, old.context);
END;
CREATE TRIGGER exercises_fts_au AFTER UPDATE ON exercises BEGIN
  INSERT INTO exercises_fts(exercises_fts, rowid, title, prompt, context)
  VALUES ('delete', old.id, old.title, old.prompt, old.context);
  INSERT INTO exercises_fts(rowid, title, prompt, context)
  VALUES (new.id, new.title, new.prompt, new.context);
END;
