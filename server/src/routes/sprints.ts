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

sprints.get('/projects/:id/sprints', async (c) => {
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = await db.get('SELECT id FROM projects WHERE id = ?', projectId)
  if (!project) return err(c, 'project not found', 404)

  const rows = await db.all('SELECT * FROM sprints WHERE project_id = ? ORDER BY start_date DESC', projectId)
  return ok(c, rows)
})

sprints.post('/projects/:id/sprints', async (c) => {
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = await db.get('SELECT id FROM projects WHERE id = ?', projectId)
  if (!project) return err(c, 'project not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { name, goal, start_date, end_date, status } = parsed.data
  const { lastID } = await db.run(
    'INSERT INTO sprints (project_id, name, goal, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?)',
    projectId, name, goal, start_date, end_date, status,
  )

  const sprint = await db.get('SELECT * FROM sprints WHERE id = ?', lastID)
  return ok(c, sprint, 201)
})

sprints.patch('/sprints/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const sprint = await db.get('SELECT * FROM sprints WHERE id = ?', id)
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
  await db.run(`UPDATE sprints SET ${sets.join(', ')} WHERE id = ?`, ...vals)

  return ok(c, await db.get('SELECT * FROM sprints WHERE id = ?', id))
})

sprints.delete('/sprints/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const sprint = await db.get<{ id: number; is_default: number }>('SELECT id, is_default FROM sprints WHERE id = ?', id)
  if (!sprint) return err(c, 'sprint not found', 404)
  if (sprint.is_default) return err(c, 'Cannot delete the Default Sprint', 409)

  await db.transaction(async () => {
    await db.run("UPDATE cards SET sprint_id = NULL, updated_at = datetime('now') WHERE sprint_id = ?", id)
    await db.run('DELETE FROM sprints WHERE id = ?', id)
  })()

  return ok(c, { id })
})

sprints.post('/sprints/:id/complete', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const sprint = await db.get('SELECT * FROM sprints WHERE id = ?', id)
  if (!sprint) return err(c, 'sprint not found', 404)

  await db.transaction(async () => {
    await db.run("UPDATE cards SET sprint_id = NULL, updated_at = datetime('now') WHERE sprint_id = ?", id)
    await db.run("UPDATE sprints SET status = 'completed' WHERE id = ?", id)
  })()

  return ok(c, await db.get('SELECT * FROM sprints WHERE id = ?', id))
})

sprints.get('/sprints/:id/cards', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const sprint = await db.get('SELECT id FROM sprints WHERE id = ?', id)
  if (!sprint) return err(c, 'sprint not found', 404)

  const rows = await db.all('SELECT * FROM cards WHERE sprint_id = ? ORDER BY position, id', id)
  return ok(c, rows)
})

sprints.get('/projects/:id/backlog', async (c) => {
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = await db.get('SELECT id FROM projects WHERE id = ?', projectId)
  if (!project) return err(c, 'project not found', 404)

  const rows = await db.all(
    `SELECT cards.*,
      COALESCE(sl.name, col.name, 'Uncategorized') AS column_name,
      COALESCE(sl.color, col.color, '#94a3b8') AS column_color
     FROM cards
     LEFT JOIN swim_lanes sl ON cards.swim_lane_id = sl.id
     LEFT JOIN columns col ON cards.column_id = col.id
     WHERE cards.sprint_id IS NULL
       AND (sl.project_id = ? OR col.project_id = ?)
     ORDER BY COALESCE(sl.position, col.position, 999), cards.position, cards.id`,
    projectId, projectId,
  )
  return ok(c, rows)
})

export default sprints
