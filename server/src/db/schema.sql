CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sprints (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  goal       TEXT    NOT NULL DEFAULT '',
  start_date TEXT    NOT NULL,
  end_date   TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'planned' CHECK (status IN ('active', 'completed', 'planned'))
);

CREATE TABLE IF NOT EXISTS columns (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  color      TEXT    NOT NULL DEFAULT '#6366f1'
);

CREATE TABLE IF NOT EXISTS cards (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  column_id    INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  sprint_id    INTEGER REFERENCES sprints(id) ON DELETE SET NULL,
  title        TEXT    NOT NULL,
  description  TEXT    NOT NULL DEFAULT '',
  priority     TEXT    NOT NULL DEFAULT 'p2' CHECK (priority IN ('p0', 'p1', 'p2', 'p3')),
  story_points INTEGER,
  assignee     TEXT,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS labels (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  color      TEXT    NOT NULL DEFAULT '#6366f1'
);

CREATE TABLE IF NOT EXISTS card_labels (
  card_id  INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, label_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id    INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  author     TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id    INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  action     TEXT    NOT NULL,
  meta       TEXT    NOT NULL DEFAULT '{}',
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
