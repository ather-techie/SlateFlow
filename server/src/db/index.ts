import sqlite3 from 'sqlite3'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import bcrypt from 'bcryptjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DB_PATH = process.env.DATABASE_PATH ?? join(__dirname, '..', '..', 'slateflow.db')
const SCHEMA_PATH = join(__dirname, 'schema.sql')

const rawDb = new sqlite3.Database(DB_PATH)

function dbRun(sql: string, params: unknown[] = []): Promise<{ lastID: number; changes: number }> {
  return new Promise((res, rej) =>
    rawDb.run(sql, params, function (this: sqlite3.RunResult, err: Error | null) {
      if (err) rej(err); else res({ lastID: this.lastID, changes: this.changes })
    })
  )
}

export const db = {
  get<T = unknown>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    return new Promise((res, rej) =>
      rawDb.get(sql, params, (err: Error | null, row: unknown) =>
        err ? rej(err) : res(row as T | undefined)
      )
    )
  },
  all<T = unknown>(sql: string, ...params: unknown[]): Promise<T[]> {
    return new Promise((res, rej) =>
      rawDb.all(sql, params, (err: Error | null, rows: unknown[]) =>
        err ? rej(err) : res((rows ?? []) as T[])
      )
    )
  },
  run(sql: string, ...params: unknown[]): Promise<{ lastID: number; changes: number }> {
    return dbRun(sql, params)
  },
  exec(sql: string): Promise<void> {
    return new Promise((res, rej) => rawDb.exec(sql, (err: Error | null) => err ? rej(err) : res()))
  },
  transaction<T>(fn: () => Promise<T>): () => Promise<T> {
    return async () => {
      await dbRun('BEGIN')
      try {
        const result = await fn()
        await dbRun('COMMIT')
        return result
      } catch (e) {
        await dbRun('ROLLBACK')
        throw e
      }
    }
  },
}

// ── Initialization (top-level await) ──────────────────────────────────────────

await db.run('PRAGMA journal_mode = WAL')
await db.run('PRAGMA foreign_keys = ON')

// Detect new tables before running schema so we can log their creation
const testTablesRow = await db.get<{ n: number }>(
  "SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='test_cases'"
)
const testTablesNew = (testTablesRow?.n ?? 0) === 0

const schema = readFileSync(SCHEMA_PATH, 'utf8')
await db.exec(schema)

if (testTablesNew) console.info('[db] Test case tables migrated')

// Additive column migrations
try { await db.exec('ALTER TABLE cards ADD COLUMN position INTEGER NOT NULL DEFAULT 0') } catch { /* exists */ }
try { await db.exec("ALTER TABLE projects ADD COLUMN color TEXT NOT NULL DEFAULT '#6366f1'") } catch { /* exists */ }
try { await db.exec('ALTER TABLE cards ADD COLUMN swim_lane_id INTEGER') } catch { /* exists */ }
try { await db.exec('ALTER TABLE cards ADD COLUMN feature_id INTEGER REFERENCES features(id) ON DELETE SET NULL') } catch { /* exists */ }
try { await db.exec('ALTER TABLE epics ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0') } catch { /* exists */ }
try { await db.exec('ALTER TABLE features ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0') } catch { /* exists */ }
try { await db.exec('ALTER TABLE projects ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0') } catch { /* exists */ }
try { await db.exec('ALTER TABLE sprints ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0') } catch { /* exists */ }

try { await db.exec('ALTER TABLE comments     ADD COLUMN author_id       INTEGER REFERENCES users(id)') } catch { /* exists */ }
try { await db.exec('ALTER TABLE activity_log ADD COLUMN user_id         INTEGER REFERENCES users(id)') } catch { /* exists */ }
try { await db.exec('ALTER TABLE cards        ADD COLUMN assignee_id     INTEGER REFERENCES users(id)') } catch { /* exists */ }
try { await db.exec('ALTER TABLE epics        ADD COLUMN assignee_id     INTEGER REFERENCES users(id)') } catch { /* exists */ }
try { await db.exec('ALTER TABLE features     ADD COLUMN assignee_id     INTEGER REFERENCES users(id)') } catch { /* exists */ }
try { await db.exec('ALTER TABLE tasks        ADD COLUMN assignee_id     INTEGER REFERENCES users(id)') } catch { /* exists */ }
try { await db.exec('ALTER TABLE test_cases   ADD COLUMN assigned_to_id  INTEGER REFERENCES users(id)') } catch { /* exists */ }
try { await db.exec('ALTER TABLE test_runs    ADD COLUMN run_by_id       INTEGER REFERENCES users(id)') } catch { /* exists */ }

try { await db.exec('ALTER TABLE epics    ADD COLUMN start_date TEXT') } catch { /* exists */ }
try { await db.exec('ALTER TABLE epics    ADD COLUMN end_date   TEXT') } catch { /* exists */ }
try { await db.exec('ALTER TABLE features ADD COLUMN start_date TEXT') } catch { /* exists */ }
try { await db.exec('ALTER TABLE features ADD COLUMN end_date   TEXT') } catch { /* exists */ }

// Make column_id nullable so swim_lane-based cards don't require a columns row
try {
  const colInfo = await db.all<{ name: string; notnull: number }>('PRAGMA table_info(cards)')
  const colDef = colInfo.find(c => c.name === 'column_id')
  if (colDef?.notnull === 1) {
    await db.run('PRAGMA foreign_keys = OFF')
    await db.exec('DROP TABLE IF EXISTS _cards_mig')
    await db.transaction(async () => {
      await db.exec(`CREATE TABLE _cards_mig (
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
      await db.exec(`INSERT INTO _cards_mig
        SELECT id, column_id, swim_lane_id, sprint_id, title, description,
               priority, story_points, assignee, position, created_at, updated_at
        FROM cards`)
      await db.exec('DROP TABLE cards')
      await db.exec('ALTER TABLE _cards_mig RENAME TO cards')
    })()
    await db.run('PRAGMA foreign_keys = ON')
  }
} catch { /* already nullable */ }

// Ensure every existing project has a Default Epic and Default Feature
const projectsNeedingDefaults = await db.all<{ id: number }>(`
  SELECT p.id FROM projects p
  WHERE NOT EXISTS (SELECT 1 FROM epics e WHERE e.project_id = p.id AND e.is_default = 1)
`)

if (projectsNeedingDefaults.length > 0) {
  await db.transaction(async () => {
    for (const { id: projectId } of projectsNeedingDefaults) {
      const { lastID: epicId } = await db.run(
        `INSERT INTO epics (project_id, title, description, priority, status, is_default, position)
         VALUES (?, 'Default Epic', '', 'p2', 'active', 1, 0)`,
        projectId,
      )
      await db.run(
        `INSERT INTO features (project_id, epic_id, title, description, priority, status, is_default, position)
         VALUES (?, ?, 'Default Feature', '', 'p2', 'active', 1, 0)`,
        projectId, epicId,
      )
    }
  })()
  console.info(`[db] Seeded Default Epic/Feature for ${projectsNeedingDefaults.length} existing project(s)`)
}

// Ensure a Default Project exists globally
const defaultProject = await db.get<{ id: number }>('SELECT id FROM projects WHERE is_default = 1')
if (!defaultProject) {
  const { lastID: dpId } = await db.run(
    `INSERT INTO projects (name, description, color, is_default) VALUES ('Default Project', '', '#6366f1', 1)`
  )
  const { lastID: dpEpicId } = await db.run(
    `INSERT INTO epics (project_id, title, description, priority, status, is_default, position)
     VALUES (?, 'Default Epic', '', 'p2', 'active', 1, 0)`,
    dpId,
  )
  await db.run(
    `INSERT INTO features (project_id, epic_id, title, description, priority, status, is_default, position)
     VALUES (?, ?, 'Default Feature', '', 'p2', 'active', 1, 0)`,
    dpId, dpEpicId,
  )
  await db.run(
    `INSERT INTO sprints (project_id, name, goal, start_date, end_date, status, is_default)
     VALUES (?, 'Default Sprint', '', date('now'), date('now', '+365 days'), 'planned', 1)`,
    dpId,
  )
  console.info('[db] Created Default Project with Default Sprint')
}

// Ensure every existing project has a Default Sprint
const projectsNeedingDefaultSprint = await db.all<{ id: number }>(`
  SELECT p.id FROM projects p
  WHERE NOT EXISTS (SELECT 1 FROM sprints s WHERE s.project_id = p.id AND s.is_default = 1)
`)

if (projectsNeedingDefaultSprint.length > 0) {
  await db.transaction(async () => {
    for (const { id: projectId } of projectsNeedingDefaultSprint) {
      await db.run(
        `INSERT INTO sprints (project_id, name, goal, start_date, end_date, status, is_default)
         VALUES (?, 'Default Sprint', '', date('now'), date('now', '+365 days'), 'planned', 1)`,
        projectId,
      )
    }
  })()
  console.info(`[db] Seeded Default Sprint for ${projectsNeedingDefaultSprint.length} existing project(s)`)
}

// Migrate legacy 'member' role to 'global_reader'
await db.run("UPDATE users SET role = 'global_reader' WHERE role = 'member'")

// Seed the super admin user on first run
const adminExists = await db.get("SELECT id FROM users WHERE email = 'admin@flow.local'")
if (!adminExists) {
  const hash = bcrypt.hashSync('Admin1234!', 12)
  await db.run(
    "INSERT INTO users (email, display_name, password_hash, role) VALUES ('admin@flow.local', 'Administrator', ?, 'super_admin')",
    hash,
  )
  console.info('[db] Seeded admin@flow.local (super_admin) — change password after first login')
}

// Seed only when the database is empty (excluding the Default Project)
const projectCountRow = await db.get<{ n: number }>('SELECT COUNT(*) as n FROM projects WHERE is_default = 0')
if ((projectCountRow?.n ?? 0) === 0) {
  await seed()
}

// Seed lane presets once
const presetCountRow = await db.get<{ n: number }>('SELECT COUNT(*) as n FROM lane_presets')
if ((presetCountRow?.n ?? 0) === 0) {
  await db.run('INSERT INTO lane_presets (name, lanes) VALUES (?, ?)', 'Basic Kanban',      JSON.stringify(['To Do', 'In Progress', 'Done']))
  await db.run('INSERT INTO lane_presets (name, lanes) VALUES (?, ?)', 'Software Dev',      JSON.stringify(['Backlog', 'Design', 'Development', 'Code Review', 'Testing', 'Done']))
  await db.run('INSERT INTO lane_presets (name, lanes) VALUES (?, ?)', 'Bug Tracking',      JSON.stringify(['New', 'Triaged', 'In Progress', 'Fixed', 'Closed']))
  await db.run('INSERT INTO lane_presets (name, lanes) VALUES (?, ?)', 'Content Pipeline',  JSON.stringify(['Ideas', 'Drafting', 'Review', 'Approved', 'Published']))
}

async function seed() {
  await db.transaction(async () => {
    const { lastID: projectId } = await db.run(
      'INSERT INTO projects (name, description) VALUES (?, ?)',
      'SlateFlow Demo',
      'Default project — delete or rename to get started.',
    )

    const { lastID: defaultEpicId } = await db.run(
      `INSERT INTO epics (project_id, title, description, priority, status, is_default, position)
       VALUES (?, 'Default Epic', '', 'p2', 'active', 1, 0)`,
      projectId,
    )
    await db.run(
      `INSERT INTO features (project_id, epic_id, title, description, priority, status, is_default, position)
       VALUES (?, ?, 'Default Feature', '', 'p2', 'active', 1, 0)`,
      projectId, defaultEpicId,
    )
    await db.run(
      `INSERT INTO sprints (project_id, name, goal, start_date, end_date, status, is_default)
       VALUES (?, 'Default Sprint', '', date('now'), date('now', '+365 days'), 'planned', 1)`,
      projectId,
    )

    const cols = [
      { name: 'To Do',       position: 0, color: '#94a3b8' },
      { name: 'In Progress', position: 1, color: '#f59e0b' },
      { name: 'Done',        position: 2, color: '#22c55e' },
    ]

    const colIds: number[] = []
    for (const { name, position, color } of cols) {
      const { lastID } = await db.run(
        'INSERT INTO columns (project_id, name, position, color) VALUES (?, ?, ?, ?)',
        projectId, name, position, color,
      )
      colIds.push(lastID)
    }

    const [todoId] = colIds
    await db.run(
      `INSERT INTO cards (column_id, title, description, priority, story_points, position) VALUES (?, ?, ?, ?, ?, ?)`,
      todoId, 'Set up project board', 'Configure columns, labels, and invite the team.', 'p1', 2, 0,
    )
    await db.run(
      `INSERT INTO cards (column_id, title, description, priority, story_points, position) VALUES (?, ?, ?, ?, ?, ?)`,
      todoId, 'Define sprint goals', 'Agree on the scope and success criteria for Sprint 1.', 'p2', 3, 1,
    )
    await db.run(
      `INSERT INTO cards (column_id, title, description, priority, story_points, position) VALUES (?, ?, ?, ?, ?, ?)`,
      todoId, 'Connect your first integration', 'Link your repo or CI pipeline to surface build status on cards.', 'p3', 1, 2,
    )
  })()
}
