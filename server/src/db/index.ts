import sqlite3 from 'sqlite3'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, isAbsolute, join, resolve } from 'path'
import bcrypt from 'bcryptjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..', '..')

function resolveDbPath(): string {
  const env = process.env.DATABASE_PATH
  if (!env) return join(__dirname, '..', '..', 'slateflow.db')
  return isAbsolute(env) ? env : resolve(REPO_ROOT, env)
}

const DB_PATH = resolveDbPath()
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

const schema = readFileSync(SCHEMA_PATH, 'utf8')
await db.exec(schema)

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

// Backfill: every existing user gets a 'password' identity row so the table is
// consistent on legacy DBs. provider_user_id is just users.id as a placeholder —
// password auth still verifies against users.password_hash, not this row.
await db.run(`
  INSERT OR IGNORE INTO user_identities (user_id, provider, provider_user_id)
  SELECT id, 'password', CAST(id AS TEXT) FROM users
`)

await db.run(`
  INSERT OR IGNORE INTO feature_overrides (flag, enabled, updated_by,updated_at)
  VALUES ('ai', 1,1, datetime('now'))
`)

// Default-on for password login so existing deployments don't lose login on upgrade.
// Env var FEATURE_AUTH_PASSWORD still wins (false hard-blocks).
await db.run(`
  INSERT OR IGNORE INTO feature_overrides (flag, enabled, updated_by,updated_at)
  VALUES ('auth_password', 1,1, datetime('now'))
`)

await db.run(`
  INSERT OR IGNORE INTO feature_overrides (flag, enabled, updated_by, updated_at)
  VALUES ('auth_google', 1,1, datetime('now'))
`)

await db.run(`
  INSERT OR IGNORE INTO feature_overrides (flag, enabled, updated_by, updated_at)
  VALUES ('auth_github', 1,1, datetime('now'))
`)

for (const sql of [
  'ALTER TABLE cards ADD COLUMN due_date TEXT',
  'ALTER TABLE cards ADD COLUMN due_reminder_sent_at TEXT',
  'ALTER TABLE tasks ADD COLUMN due_date TEXT',
  'ALTER TABLE tasks ADD COLUMN due_reminder_sent_at TEXT',
  'ALTER TABLE users ADD COLUMN email_notifications INTEGER NOT NULL DEFAULT 1',
]) {
  try { db.exec(sql) } catch { /* column already exists */ }
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
    // ── Project ──────────────────────────────────────────────────────────────
    const { lastID: projectId } = await db.run(
      'INSERT INTO projects (name, description, color) VALUES (?, ?, ?)',
      'SlateFlow Demo',
      'Demo project — explore the full work-item hierarchy.',
      '#6366f1',
    )

    // ── Defaults (required by the app) ───────────────────────────────────────
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

    // ── Swim Lanes ───────────────────────────────────────────────────────────
    const { lastID: todoLaneId } = await db.run(
      `INSERT INTO swim_lanes (project_id, name, position, color, is_done_col) VALUES (?, 'To Do', 0, '#94a3b8', 0)`,
      projectId,
    )
    const { lastID: inProgressLaneId } = await db.run(
      `INSERT INTO swim_lanes (project_id, name, position, color, is_done_col) VALUES (?, 'In Progress', 1, '#f59e0b', 0)`,
      projectId,
    )
    const { lastID: doneLaneId } = await db.run(
      `INSERT INTO swim_lanes (project_id, name, position, color, is_done_col) VALUES (?, 'Done', 2, '#22c55e', 1)`,
      projectId,
    )

    // ── Named Sprints ────────────────────────────────────────────────────────
    const { lastID: sprint1Id } = await db.run(
      `INSERT INTO sprints (project_id, name, goal, start_date, end_date, status, is_default)
       VALUES (?, 'Sprint 1 – MVP Core', 'Ship core auth and board features', date('now', '-14 days'), date('now', '+14 days'), 'active', 0)`,
      projectId,
    )
    const { lastID: sprint2Id } = await db.run(
      `INSERT INTO sprints (project_id, name, goal, start_date, end_date, status, is_default)
       VALUES (?, 'Sprint 2 – User Mgmt', 'Deliver role management and sprint tooling', date('now', '+14 days'), date('now', '+28 days'), 'planned', 0)`,
      projectId,
    )

    // ── Epics ────────────────────────────────────────────────────────────────
    const { lastID: authEpicId } = await db.run(
      `INSERT INTO epics (project_id, title, description, priority, status, is_default, position)
       VALUES (?, 'Authentication & Security', 'Covers login, sessions, and access control.', 'p1', 'active', 0, 1)`,
      projectId,
    )
    const { lastID: boardEpicId } = await db.run(
      `INSERT INTO epics (project_id, title, description, priority, status, is_default, position)
       VALUES (?, 'Board & Workflow', 'Kanban board mechanics and sprint planning tools.', 'p2', 'new', 0, 2)`,
      projectId,
    )

    // ── Features ─────────────────────────────────────────────────────────────
    const { lastID: loginFeatureId } = await db.run(
      `INSERT INTO features (project_id, epic_id, title, description, priority, status, is_default, position)
       VALUES (?, ?, 'Login & Session Management', 'User login, logout, and JWT session handling.', 'p1', 'active', 0, 1)`,
      projectId, authEpicId,
    )
    const { lastID: rbacFeatureId } = await db.run(
      `INSERT INTO features (project_id, epic_id, title, description, priority, status, is_default, position)
       VALUES (?, ?, 'Role-Based Access Control', 'Assign and enforce project-level roles.', 'p2', 'new', 0, 2)`,
      projectId, authEpicId,
    )
    const { lastID: kanbanFeatureId } = await db.run(
      `INSERT INTO features (project_id, epic_id, title, description, priority, status, is_default, position)
       VALUES (?, ?, 'Kanban Board', 'Drag-and-drop lane management and card workflow.', 'p1', 'active', 0, 1)`,
      projectId, boardEpicId,
    )
    const { lastID: sprintFeatureId } = await db.run(
      `INSERT INTO features (project_id, epic_id, title, description, priority, status, is_default, position)
       VALUES (?, ?, 'Sprint Planning', 'Create, activate, and complete sprints.', 'p2', 'new', 0, 2)`,
      projectId, boardEpicId,
    )

    // ── Stories (cards) ──────────────────────────────────────────────────────
    const { lastID: loginFormId } = await db.run(
      `INSERT INTO cards (swim_lane_id, sprint_id, feature_id, title, description, priority, story_points, position)
       VALUES (?, ?, ?, 'User login form', 'Build the login page with email/password fields and validation.', 'p1', 3, 0)`,
      inProgressLaneId, sprint1Id, loginFeatureId,
    )
    const { lastID: jwtRefreshId } = await db.run(
      `INSERT INTO cards (swim_lane_id, sprint_id, feature_id, title, description, priority, story_points, position)
       VALUES (?, ?, ?, 'JWT token refresh', 'Implement silent token refresh before expiry.', 'p2', 2, 1)`,
      todoLaneId, sprint1Id, loginFeatureId,
    )
    await db.run(
      `INSERT INTO cards (swim_lane_id, sprint_id, feature_id, title, description, priority, story_points, position)
       VALUES (?, ?, ?, 'Assign roles to users', 'Admin UI to grant project_admin / contributor / reader roles.', 'p1', 5, 0)`,
      todoLaneId, sprint1Id, rbacFeatureId,
    )
    const { lastID: dndCardId } = await db.run(
      `INSERT INTO cards (swim_lane_id, sprint_id, feature_id, title, description, priority, story_points, position)
       VALUES (?, ?, ?, 'Drag and drop cards', 'Enable pointer-based DnD across swim lanes using @dnd-kit.', 'p1', 3, 0)`,
      doneLaneId, sprint1Id, kanbanFeatureId,
    )
    const { lastID: labelsCardId } = await db.run(
      `INSERT INTO cards (swim_lane_id, sprint_id, feature_id, title, description, priority, story_points, position)
       VALUES (?, ?, ?, 'Add card labels', 'Create, assign, and filter stories by colour-coded labels.', 'p2', 2, 0)`,
      inProgressLaneId, sprint2Id, kanbanFeatureId,
    )
    await db.run(
      `INSERT INTO cards (swim_lane_id, sprint_id, feature_id, title, description, priority, story_points, position)
       VALUES (?, ?, ?, 'Create and manage sprints', 'Sprint create/edit form with goal, dates, and status transitions.', 'p2', 3, 0)`,
      todoLaneId, sprint2Id, sprintFeatureId,
    )

    // ── Tasks ────────────────────────────────────────────────────────────────
    await db.run(`INSERT INTO tasks (story_id, title, status, position) VALUES (?, 'Design login UI mockup',        'done',        0)`, loginFormId)
    await db.run(`INSERT INTO tasks (story_id, title, status, position) VALUES (?, 'Implement form validation',     'in-progress', 1)`, loginFormId)
    await db.run(`INSERT INTO tasks (story_id, title, status, position) VALUES (?, 'Write accessibility tests',     'to-do',       2)`, loginFormId)

    await db.run(`INSERT INTO tasks (story_id, title, status, position) VALUES (?, 'Research DnD library options',  'done', 0)`, dndCardId)
    await db.run(`INSERT INTO tasks (story_id, title, status, position) VALUES (?, 'Implement drag events',         'done', 1)`, dndCardId)
    await db.run(`INSERT INTO tasks (story_id, title, status, position) VALUES (?, 'Handle edge cases',             'done', 2)`, dndCardId)

    // ── Test Suites & Test Cases ──────────────────────────────────────────────
    const { lastID: authSuiteId } = await db.run(
      `INSERT INTO test_suites (project_id, name, description) VALUES (?, 'Authentication Tests', 'Covers login, logout, and token handling.')`,
      projectId,
    )
    const { lastID: boardSuiteId } = await db.run(
      `INSERT INTO test_suites (project_id, name, description) VALUES (?, 'Board Functionality Tests', 'Covers swim lanes, drag-and-drop, and labels.')`,
      projectId,
    )

    await db.run(
      `INSERT INTO test_cases (suite_id, card_id, project_id, title, status, priority, test_type, steps, expected_result, position)
       VALUES (?, ?, ?, 'Login with valid credentials', 'passed', 'critical', 'manual',
               '1. Navigate to /login\n2. Enter valid email and password\n3. Click Sign In',
               'User is redirected to dashboard with a valid session cookie.',
               0)`,
      authSuiteId, loginFormId, projectId,
    )
    await db.run(
      `INSERT INTO test_cases (suite_id, card_id, project_id, title, status, priority, test_type, steps, expected_result, position)
       VALUES (?, ?, ?, 'Login with invalid password', 'passed', 'high', 'manual',
               '1. Navigate to /login\n2. Enter valid email and wrong password\n3. Click Sign In',
               'Error message is shown; no session cookie is set.',
               1)`,
      authSuiteId, loginFormId, projectId,
    )
    await db.run(
      `INSERT INTO test_cases (suite_id, card_id, project_id, title, status, priority, test_type, steps, expected_result, position)
       VALUES (?, ?, ?, 'JWT token expiry check', 'untested', 'medium', 'manual',
               '1. Log in and note token expiry\n2. Wait for token to expire\n3. Make an authenticated request',
               'Token is refreshed silently; user session continues uninterrupted.',
               0)`,
      authSuiteId, jwtRefreshId, projectId,
    )
    await db.run(
      `INSERT INTO test_cases (suite_id, card_id, project_id, title, status, priority, test_type, steps, expected_result, position)
       VALUES (?, ?, ?, 'Card moves between swim lanes', 'passed', 'critical', 'manual',
               '1. Open the board\n2. Drag a card from To Do to In Progress\n3. Release',
               'Card appears in In Progress lane; position is persisted on reload.',
               0)`,
      boardSuiteId, dndCardId, projectId,
    )
    await db.run(
      `INSERT INTO test_cases (suite_id, card_id, project_id, title, status, priority, test_type, steps, expected_result, position)
       VALUES (?, ?, ?, 'Card label assignment', 'untested', 'medium', 'manual',
               '1. Open a card\n2. Add a label via the label picker\n3. Save and reopen',
               'Label is visible on the card in both modal and board view.',
               0)`,
      boardSuiteId, labelsCardId, projectId,
    )
  })()
}
