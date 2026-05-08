CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  color       TEXT    NOT NULL DEFAULT '#6366f1',
  is_default  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lane_presets (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT    NOT NULL,
  lanes TEXT    NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS swim_lanes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  color       TEXT    NOT NULL DEFAULT '#6366f1',
  is_done_col INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sprints (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  goal       TEXT    NOT NULL DEFAULT '',
  start_date TEXT    NOT NULL,
  end_date   TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'planned' CHECK (status IN ('active', 'completed', 'planned')),
  is_default INTEGER NOT NULL DEFAULT 0
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
  column_id    INTEGER REFERENCES columns(id) ON DELETE CASCADE,
  swim_lane_id INTEGER REFERENCES swim_lanes(id) ON DELETE CASCADE,
  sprint_id    INTEGER REFERENCES sprints(id) ON DELETE SET NULL,
  feature_id   INTEGER REFERENCES features(id) ON DELETE SET NULL,
  title        TEXT    NOT NULL,
  description  TEXT    NOT NULL DEFAULT '',
  priority     TEXT    NOT NULL DEFAULT 'p2' CHECK (priority IN ('p0', 'p1', 'p2', 'p3')),
  story_points INTEGER,
  assignee     TEXT,
  assignee_id  INTEGER REFERENCES users(id),
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
  author_id  INTEGER REFERENCES users(id),
  body       TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id    INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id),
  action     TEXT    NOT NULL,
  meta       TEXT    NOT NULL DEFAULT '{}',
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS test_suites (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  description TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS test_cases (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  suite_id        INTEGER REFERENCES test_suites(id) ON DELETE SET NULL,
  card_id         INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title           TEXT    NOT NULL,
  description     TEXT,
  status          TEXT    NOT NULL DEFAULT 'untested'
                  CHECK(status IN ('untested','passed','failed','blocked','skipped')),
  priority        TEXT    NOT NULL DEFAULT 'medium'
                  CHECK(priority IN ('critical','high','medium','low')),
  test_type       TEXT    NOT NULL DEFAULT 'manual'
                  CHECK(test_type IN ('manual','automated')),
  steps           TEXT,
  preconditions   TEXT,
  expected_result TEXT,
  assigned_to     TEXT,
  assigned_to_id  INTEGER REFERENCES users(id),
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS test_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  test_case_id INTEGER NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  card_id      INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  status       TEXT    NOT NULL CHECK(status IN ('passed','failed','blocked','skipped')),
  notes        TEXT,
  run_by       TEXT,
  run_by_id    INTEGER REFERENCES users(id),
  run_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS epics (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  priority    TEXT    NOT NULL DEFAULT 'p2' CHECK (priority IN ('p0','p1','p2','p3')),
  status      TEXT    NOT NULL DEFAULT 'new' CHECK (status IN ('new','active','resolved','closed')),
  assignee    TEXT,
  assignee_id INTEGER REFERENCES users(id),
  position    INTEGER NOT NULL DEFAULT 0,
  is_default  INTEGER NOT NULL DEFAULT 0,
  start_date  TEXT,
  end_date    TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS features (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  epic_id     INTEGER REFERENCES epics(id) ON DELETE SET NULL,
  title       TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  priority    TEXT    NOT NULL DEFAULT 'p2' CHECK (priority IN ('p0','p1','p2','p3')),
  status      TEXT    NOT NULL DEFAULT 'new' CHECK (status IN ('new','active','resolved','closed')),
  assignee    TEXT,
  assignee_id INTEGER REFERENCES users(id),
  position    INTEGER NOT NULL DEFAULT 0,
  is_default  INTEGER NOT NULL DEFAULT 0,
  start_date  TEXT,
  end_date    TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id    INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  status      TEXT    NOT NULL DEFAULT 'to-do' CHECK (status IN ('to-do','in-progress','done')),
  assignee    TEXT,
  assignee_id INTEGER REFERENCES users(id),
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── Authentication ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'global_reader' CHECK(role IN ('super_admin', 'global_reader')),
  is_active     INTEGER NOT NULL DEFAULT 1,
  deleted_at    TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Epic-scoped role assignments (one row per user–epic pair) — kept for backward compat
CREATE TABLE IF NOT EXISTS epic_access (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  epic_id    INTEGER NOT NULL REFERENCES epics(id) ON DELETE CASCADE,
  role       TEXT    NOT NULL DEFAULT 'reader' CHECK(role IN ('epic_admin','contributor','reader')),
  granted_by INTEGER REFERENCES users(id),
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, epic_id)
);

-- Project-scoped role assignments (one row per user–project pair)
CREATE TABLE IF NOT EXISTS project_access (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role       TEXT    NOT NULL DEFAULT 'reader' CHECK(role IN ('project_admin','contributor','reader')),
  granted_by INTEGER REFERENCES users(id),
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, project_id)
);

-- Notification inbox (mentions, assignments, board events)
CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  type        TEXT    NOT NULL CHECK(type IN ('mention','board_update','assignment')),
  entity_type TEXT    NOT NULL DEFAULT 'card',
  entity_id   INTEGER NOT NULL,
  message     TEXT    NOT NULL,
  is_read     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_epic_access_user ON epic_access(user_id);
CREATE INDEX IF NOT EXISTS idx_epic_access_epic ON epic_access(epic_id);
CREATE INDEX IF NOT EXISTS idx_project_access_user ON project_access(user_id);
CREATE INDEX IF NOT EXISTS idx_project_access_project ON project_access(project_id);

-- Story dependency relationships (blocks / blocked-by)
CREATE TABLE IF NOT EXISTS story_dependencies (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  blocker_id  INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  blocked_id  INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(blocker_id, blocked_id),
  CHECK(blocker_id != blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_story_dep_blocker ON story_dependencies(blocker_id);
CREATE INDEX IF NOT EXISTS idx_story_dep_blocked ON story_dependencies(blocked_id);

-- Enterprise feature flag runtime overrides (env var is the hard ceiling)
CREATE TABLE IF NOT EXISTS feature_overrides (
  flag        TEXT    NOT NULL PRIMARY KEY,
  enabled     INTEGER NOT NULL DEFAULT 0,
  updated_by  INTEGER REFERENCES users(id),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── Retrospectives (per-sprint) ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS retrospectives (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sprint_id  INTEGER NOT NULL UNIQUE REFERENCES sprints(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS retrospective_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  retrospective_id INTEGER NOT NULL REFERENCES retrospectives(id) ON DELETE CASCADE,
  category         TEXT    NOT NULL CHECK (category IN ('went_well','to_improve','action')),
  body             TEXT    NOT NULL,
  position         INTEGER NOT NULL DEFAULT 0,
  author_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_retro_items_retro ON retrospective_items(retrospective_id);

-- ── Calendar entries (holidays, events, vacations) ────────────────────────────
-- holiday  : project_id NULL, user_id NULL  — global, super_admin only
-- event    : project_id NOT NULL, user_id NULL — project-scoped, contributor+
-- vacation : project_id NULL, user_id NOT NULL — user-owned, self/admin

CREATE TABLE IF NOT EXISTS calendar_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT    NOT NULL CHECK (kind IN ('holiday','event','vacation')),
  project_id  INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL,
  description TEXT,
  start_date  TEXT    NOT NULL,
  end_date    TEXT    NOT NULL,
  color       TEXT,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_calendar_entries_project ON calendar_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_calendar_entries_user    ON calendar_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_entries_dates   ON calendar_entries(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_calendar_entries_kind    ON calendar_entries(kind);
