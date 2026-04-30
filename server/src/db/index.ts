import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DB_PATH = process.env.DATABASE_PATH ?? join(__dirname, '..', '..', 'liteboard.db')
const SCHEMA_PATH = join(__dirname, 'schema.sql')

export const db = new Database(DB_PATH)

// Enable WAL mode and foreign keys for every connection
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Run schema migrations on startup
const schema = readFileSync(SCHEMA_PATH, 'utf8')
db.exec(schema)

// Additive column migrations for databases created before position was added
try { db.exec('ALTER TABLE cards ADD COLUMN position INTEGER NOT NULL DEFAULT 0') } catch { /* already exists */ }

// Seed only when the database is empty
const projectCount = (db.prepare('SELECT COUNT(*) as n FROM projects').get() as { n: number }).n
if (projectCount === 0) {
  seed()
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
      'Liteboard Demo',
      'Default project — delete or rename to get started.'
    )

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
