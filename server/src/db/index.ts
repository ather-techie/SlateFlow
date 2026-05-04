import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import bcrypt from 'bcryptjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DB_PATH = process.env.DATABASE_PATH ?? join(__dirname, '..', '..', 'slateflow.db')
const SCHEMA_PATH = join(__dirname, 'schema.sql')

export const db = new Database(DB_PATH)

// Enable WAL mode and foreign keys for every connection
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Detect new tables before running schema so we can log their creation
const testTablesNew = (db.prepare(
  "SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='test_cases'"
).get() as { n: number }).n === 0

// Run schema migrations on startup
const schema = readFileSync(SCHEMA_PATH, 'utf8')
db.exec(schema)

if (testTablesNew) console.info('[db] Test case tables migrated')

// Additive column migrations for databases created before position was added
try { db.exec('ALTER TABLE cards ADD COLUMN position INTEGER NOT NULL DEFAULT 0') } catch { /* already exists */ }
try { db.exec("ALTER TABLE projects ADD COLUMN color TEXT NOT NULL DEFAULT '#6366f1'") } catch { /* already exists */ }
// swim_lane_id links cards to swim_lanes once projects adopt the new lane system
try { db.exec('ALTER TABLE cards ADD COLUMN swim_lane_id INTEGER') } catch { /* already exists */ }
// feature_id links stories (cards) to features in the Epic > Feature > Story hierarchy
try { db.exec('ALTER TABLE cards ADD COLUMN feature_id INTEGER REFERENCES features(id) ON DELETE SET NULL') } catch { /* already exists */ }
// is_default flags the protected Default Epic / Default Feature per project
try { db.exec('ALTER TABLE epics ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0') } catch { /* already exists */ }
try { db.exec('ALTER TABLE features ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0') } catch { /* already exists */ }
// is_default flags the protected Default Project (global) and Default Sprint (per project)
try { db.exec('ALTER TABLE projects ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0') } catch { /* already exists */ }
try { db.exec('ALTER TABLE sprints ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0') } catch { /* already exists */ }

// Auth: link assignee/author fields to users table (nullable; TEXT cols kept for backward compat)
try { db.exec('ALTER TABLE comments     ADD COLUMN author_id       INTEGER REFERENCES users(id)') } catch { /* exists */ }
try { db.exec('ALTER TABLE activity_log ADD COLUMN user_id         INTEGER REFERENCES users(id)') } catch { /* exists */ }
try { db.exec('ALTER TABLE cards        ADD COLUMN assignee_id     INTEGER REFERENCES users(id)') } catch { /* exists */ }
try { db.exec('ALTER TABLE epics        ADD COLUMN assignee_id     INTEGER REFERENCES users(id)') } catch { /* exists */ }
try { db.exec('ALTER TABLE features     ADD COLUMN assignee_id     INTEGER REFERENCES users(id)') } catch { /* exists */ }
try { db.exec('ALTER TABLE tasks        ADD COLUMN assignee_id     INTEGER REFERENCES users(id)') } catch { /* exists */ }
try { db.exec('ALTER TABLE test_cases   ADD COLUMN assigned_to_id  INTEGER REFERENCES users(id)') } catch { /* exists */ }
try { db.exec('ALTER TABLE test_runs    ADD COLUMN run_by_id       INTEGER REFERENCES users(id)') } catch { /* exists */ }

// Roadmap: date ranges on epics and features
try { db.exec('ALTER TABLE epics    ADD COLUMN start_date TEXT') } catch { /* exists */ }
try { db.exec('ALTER TABLE epics    ADD COLUMN end_date   TEXT') } catch { /* exists */ }
try { db.exec('ALTER TABLE features ADD COLUMN start_date TEXT') } catch { /* exists */ }
try { db.exec('ALTER TABLE features ADD COLUMN end_date   TEXT') } catch { /* exists */ }

// Make column_id nullable so swim_lane-based cards don't require a columns row
try {
  const colInfo = (db.prepare('PRAGMA table_info(cards)').all() as { name: string; notnull: number }[])
    .find(c => c.name === 'column_id')
  if (colInfo?.notnull === 1) {
    db.pragma('foreign_keys = OFF')
    db.exec('DROP TABLE IF EXISTS _cards_mig')
    db.transaction(() => {
      db.exec(`CREATE TABLE _cards_mig (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        column_id    INTEGER REFERENCES columns(id) ON DELETE CASCADE,
        swim_lane_id INTEGER REFERENCES swim_lanes(id) ON DELETE CASCADE,
        sprint_id    INTEGER REFERENCES sprints(id) ON DELETE SET NULL,
        title        TEXT    NOT NULL,
        description  TEXT    NOT NULL DEFAULT '',
        priority     TEXT    NOT NULL DEFAULT 'p2' CHECK (priority IN ('p0','p1','p2','p3')),
        story_points INTEGER,
        assignee     TEXT,
        position     INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
      )`)
      db.exec(`INSERT INTO _cards_mig
        SELECT id, column_id, swim_lane_id, sprint_id, title, description,
               priority, story_points, assignee, position, created_at, updated_at
        FROM cards`)
      db.exec('DROP TABLE cards')
      db.exec('ALTER TABLE _cards_mig RENAME TO cards')
    })()
    db.pragma('foreign_keys = ON')
  }
} catch { /* already nullable */ }

// Ensure every existing project has a Default Epic and Default Feature
const projectsNeedingDefaults = db.prepare(`
  SELECT p.id FROM projects p
  WHERE NOT EXISTS (SELECT 1 FROM epics e WHERE e.project_id = p.id AND e.is_default = 1)
`).all() as { id: number }[]

if (projectsNeedingDefaults.length > 0) {
  const insDefaultEpic = db.prepare(
    `INSERT INTO epics (project_id, title, description, priority, status, is_default, position)
     VALUES (?, 'Default Epic', '', 'p2', 'active', 1, 0)`
  )
  const insDefaultFeature = db.prepare(
    `INSERT INTO features (project_id, epic_id, title, description, priority, status, is_default, position)
     VALUES (?, ?, 'Default Feature', '', 'p2', 'active', 1, 0)`
  )
  db.transaction(() => {
    for (const { id: projectId } of projectsNeedingDefaults) {
      const { lastInsertRowid: epicId } = insDefaultEpic.run(projectId)
      insDefaultFeature.run(projectId, epicId)
    }
  })()
  console.info(`[db] Seeded Default Epic/Feature for ${projectsNeedingDefaults.length} existing project(s)`)
}

// Ensure a Default Project exists globally
const defaultProject = db.prepare('SELECT id FROM projects WHERE is_default = 1').get() as { id: number } | undefined
if (!defaultProject) {
  const { lastInsertRowid: dpId } = db.prepare(
    `INSERT INTO projects (name, description, color, is_default) VALUES ('Default Project', '', '#6366f1', 1)`
  ).run()
  // Give the Default Project its Default Epic + Feature
  const { lastInsertRowid: dpEpicId } = db.prepare(
    `INSERT INTO epics (project_id, title, description, priority, status, is_default, position)
     VALUES (?, 'Default Epic', '', 'p2', 'active', 1, 0)`
  ).run(dpId)
  db.prepare(
    `INSERT INTO features (project_id, epic_id, title, description, priority, status, is_default, position)
     VALUES (?, ?, 'Default Feature', '', 'p2', 'active', 1, 0)`
  ).run(dpId, dpEpicId)
  // Give the Default Project its Default Sprint
  db.prepare(
    `INSERT INTO sprints (project_id, name, goal, start_date, end_date, status, is_default)
     VALUES (?, 'Default Sprint', '', date('now'), date('now', '+365 days'), 'planned', 1)`
  ).run(dpId)
  console.info('[db] Created Default Project with Default Sprint')
}

// Ensure every existing project has a Default Sprint
const projectsNeedingDefaultSprint = db.prepare(`
  SELECT p.id FROM projects p
  WHERE NOT EXISTS (SELECT 1 FROM sprints s WHERE s.project_id = p.id AND s.is_default = 1)
`).all() as { id: number }[]

if (projectsNeedingDefaultSprint.length > 0) {
  const insDefaultSprint = db.prepare(
    `INSERT INTO sprints (project_id, name, goal, start_date, end_date, status, is_default)
     VALUES (?, 'Default Sprint', '', date('now'), date('now', '+365 days'), 'planned', 1)`
  )
  db.transaction(() => {
    for (const { id: projectId } of projectsNeedingDefaultSprint) {
      insDefaultSprint.run(projectId)
    }
  })()
  console.info(`[db] Seeded Default Sprint for ${projectsNeedingDefaultSprint.length} existing project(s)`)
}

// Seed the super admin user on first run
const adminExists = db.prepare("SELECT id FROM users WHERE email = 'admin@flow.local'").get()
if (!adminExists) {
  const hash = bcrypt.hashSync('Admin1234!', 12)
  db.prepare(
    "INSERT INTO users (email, display_name, password_hash, role) VALUES ('admin@flow.local', 'Administrator', ?, 'super_admin')"
  ).run(hash)
  console.info('[db] Seeded admin@flow.local (super_admin) — change password after first login')
}

// Seed only when the database is empty (excluding the Default Project)
const projectCount = (db.prepare('SELECT COUNT(*) as n FROM projects WHERE is_default = 0').get() as { n: number }).n
if (projectCount === 0) {
  seed()
}

// Seed lane presets once
const presetCount = (db.prepare('SELECT COUNT(*) as n FROM lane_presets').get() as { n: number }).n
if (presetCount === 0) {
  const ins = db.prepare('INSERT INTO lane_presets (name, lanes) VALUES (?, ?)')
  ins.run('Basic Kanban',   JSON.stringify(['To Do', 'In Progress', 'Done']))
  ins.run('Software Dev',   JSON.stringify(['Backlog', 'Design', 'Development', 'Code Review', 'Testing', 'Done']))
  ins.run('Bug Tracking',   JSON.stringify(['New', 'Triaged', 'In Progress', 'Fixed', 'Closed']))
  ins.run('Content Pipeline', JSON.stringify(['Ideas', 'Drafting', 'Review', 'Approved', 'Published']))
}

function seed() {
  const insertProject = db.prepare(
    'INSERT INTO projects (name, description) VALUES (?, ?)'
  )
  const insertColumn = db.prepare(
    'INSERT INTO columns (project_id, name, position, color) VALUES (?, ?, ?, ?)'
  )
  const insertCard = db.prepare(
    `INSERT INTO cards (column_id, title, description, priority, story_points, position)
     VALUES (?, ?, ?, ?, ?, ?)`
  )

  const run = db.transaction(() => {
    const { lastInsertRowid: projectId } = insertProject.run(
      'SlateFlow Demo',
      'Default project — delete or rename to get started.'
    )

    const { lastInsertRowid: defaultEpicId } = db.prepare(
      `INSERT INTO epics (project_id, title, description, priority, status, is_default, position)
       VALUES (?, 'Default Epic', '', 'p2', 'active', 1, 0)`
    ).run(projectId)
    db.prepare(
      `INSERT INTO features (project_id, epic_id, title, description, priority, status, is_default, position)
       VALUES (?, ?, 'Default Feature', '', 'p2', 'active', 1, 0)`
    ).run(projectId, defaultEpicId)
    db.prepare(
      `INSERT INTO sprints (project_id, name, goal, start_date, end_date, status, is_default)
       VALUES (?, 'Default Sprint', '', date('now'), date('now', '+365 days'), 'planned', 1)`
    ).run(projectId)

    const cols = [
      { name: 'To Do',       position: 0, color: '#94a3b8' },
      { name: 'In Progress', position: 1, color: '#f59e0b' },
      { name: 'Done',        position: 2, color: '#22c55e' },
    ]

    const colIds = cols.map(({ name, position, color }) => {
      const { lastInsertRowid } = insertColumn.run(projectId, name, position, color)
      return lastInsertRowid
    })

    const [todoId] = colIds

    insertCard.run(todoId, 'Set up project board',           'Configure columns, labels, and invite the team.', 'p1', 2, 0)
    insertCard.run(todoId, 'Define sprint goals',            'Agree on the scope and success criteria for Sprint 1.', 'p2', 3, 1)
    insertCard.run(todoId, 'Connect your first integration', 'Link your repo or CI pipeline to surface build status on cards.', 'p3', 1, 2)
  })

  run()
}
