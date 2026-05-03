import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId, zodErr } from '../lib/response.js'

const sprints = new Hono()

const dateRx = /^\d{4}-\d{2}-\d{2}$/

const CreateSchema = z.object({
  name: z.string().min(1, 'name is required').max(200),
  goal: z.string().max(2000).optional().default(''),
  start_date: z.string().regex(dateRx, 'start_date must be YYYY-MM-DD'),
  end_date: z.string().regex(dateRx, 'end_date must be YYYY-MM-DD'),
  status: z.enum(['active', 'completed', 'planned']).optional().default('planned'),
})

const UpdateSchema = CreateSchema.partial()

sprints.get('/projects/:id/sprints', (c) => {
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
  if (!project) return err(c, 'project not found', 404)

  const rows = db
    .prepare('SELECT * FROM sprints WHERE project_id = ? ORDER BY start_date DESC')
    .all(projectId)
  return ok(c, rows)
})

sprints.post('/projects/:id/sprints', async (c) => {
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
  if (!project) return err(c, 'project not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { name, goal, start_date, end_date, status } = parsed.data
  const { lastInsertRowid } = db
    .prepare(
      'INSERT INTO sprints (project_id, name, goal, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(projectId, name, goal, start_date, end_date, status)

  const sprint = db.prepare('SELECT * FROM sprints WHERE id = ?').get(lastInsertRowid)
  return ok(c, sprint, 201)
})

sprints.patch('/sprints/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const sprint = db.prepare('SELECT * FROM sprints WHERE id = ?').get(id)
  if (!sprint) return err(c, 'sprint not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const fields = parsed.data
  const sets: string[] = []
  const vals: unknown[] = []

  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined) { sets.push(`${key} = ?`); vals.push(val) }
  }

  if (sets.length === 0) return err(c, 'no fields to update', 400)

  vals.push(id)
  db.prepare(`UPDATE sprints SET ${sets.join(', ')} WHERE id = ?`).run(...vals)

  return ok(c, db.prepare('SELECT * FROM sprints WHERE id = ?').get(id))
})

sprints.delete('/sprints/:id', (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const sprint = db.prepare('SELECT id, is_default FROM sprints WHERE id = ?').get(id) as
    | { id: number; is_default: number }
    | undefined
  if (!sprint) return err(c, 'sprint not found', 404)
  if (sprint.is_default) return err(c, 'Cannot delete the Default Sprint', 409)

  db.transaction(() => {
    db.prepare("UPDATE cards SET sprint_id = NULL, updated_at = datetime('now') WHERE sprint_id = ?").run(id)
    db.prepare('DELETE FROM sprints WHERE id = ?').run(id)
  })()

  return ok(c, { id })
})

sprints.post('/sprints/:id/complete', (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const sprint = db.prepare('SELECT * FROM sprints WHERE id = ?').get(id) as { id: number } | undefined
  if (!sprint) return err(c, 'sprint not found', 404)

  db.transaction(() => {
    // Move all cards in this sprint to backlog (sprint_id = NULL)
    db.prepare("UPDATE cards SET sprint_id = NULL, updated_at = datetime('now') WHERE sprint_id = ?").run(id)
    db.prepare("UPDATE sprints SET status = 'completed' WHERE id = ?").run(id)
  })()

  return ok(c, db.prepare('SELECT * FROM sprints WHERE id = ?').get(id))
})

// ── list cards in a sprint ─────────────────────────────────────────────────
sprints.get('/sprints/:id/cards', (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const sprint = db.prepare('SELECT id FROM sprints WHERE id = ?').get(id)
  if (!sprint) return err(c, 'sprint not found', 404)

  const rows = db
    .prepare('SELECT * FROM cards WHERE sprint_id = ? ORDER BY position, id')
    .all(id)
  return ok(c, rows)
})

// ── backlog: cards with no sprint, for a project ───────────────────────────
sprints.get('/projects/:id/backlog', (c) => {
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
  if (!project) return err(c, 'project not found', 404)

  // Support both new cards (swim_lane_id) and legacy cards (column_id)
  const rows = db.prepare(`
    SELECT cards.*,
      COALESCE(sl.name, col.name, 'Uncategorized') AS column_name,
      COALESCE(sl.color, col.color, '#94a3b8') AS column_color
    FROM cards
    LEFT JOIN swim_lanes sl ON cards.swim_lane_id = sl.id
    LEFT JOIN columns col ON cards.column_id = col.id
    WHERE cards.sprint_id IS NULL
      AND (sl.project_id = ? OR col.project_id = ?)
    ORDER BY COALESCE(sl.position, col.position, 999), cards.position, cards.id
  `).all(projectId, projectId)
  return ok(c, rows)
})

export default sprints
