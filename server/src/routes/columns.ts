import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId, zodErr } from '../lib/response.js'

const columns = new Hono()

const CreateSchema = z.object({
  name: z.string().min(1, 'name is required').max(200),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{3,6}$/, 'color must be a hex value')
    .optional()
    .default('#6366f1'),
  position: z.number().int().min(0).optional(),
})

const UpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{3,6}$/, 'color must be a hex value')
    .optional(),
  position: z.number().int().min(0).optional(),
})

columns.get('/projects/:id/columns', (c) => {
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
  if (!project) return err(c, 'project not found', 404)

  const rows = db
    .prepare('SELECT * FROM columns WHERE project_id = ? ORDER BY position, id')
    .all(projectId)
  return ok(c, rows)
})

columns.post('/projects/:id/columns', async (c) => {
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
  if (!project) return err(c, 'project not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { name, color } = parsed.data
  const maxPos = (
    db
      .prepare('SELECT COALESCE(MAX(position), -1) as m FROM columns WHERE project_id = ?')
      .get(projectId) as { m: number }
  ).m
  const position = parsed.data.position ?? maxPos + 1

  const { lastInsertRowid } = db
    .prepare('INSERT INTO columns (project_id, name, position, color) VALUES (?, ?, ?, ?)')
    .run(projectId, name, position, color)

  const col = db.prepare('SELECT * FROM columns WHERE id = ?').get(lastInsertRowid)
  return ok(c, col, 201)
})

columns.patch('/columns/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const col = db.prepare('SELECT * FROM columns WHERE id = ?').get(id) as {
    id: number
    project_id: number
    position: number
  } | undefined
  if (!col) return err(c, 'column not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { name, color, position } = parsed.data

  db.transaction(() => {
    if (position !== undefined && position !== col.position) {
      // Shift siblings to make room, then place this column
      const dir = position < col.position ? 1 : -1
      const [lo, hi] =
        position < col.position
          ? [position, col.position - 1]
          : [col.position + 1, position]

      db.prepare(
        `UPDATE columns SET position = position + ?
         WHERE project_id = ? AND id != ? AND position BETWEEN ? AND ?`,
      ).run(dir, col.project_id, id, lo, hi)
    }

    const sets: string[] = []
    const vals: unknown[] = []
    if (name !== undefined) { sets.push('name = ?'); vals.push(name) }
    if (color !== undefined) { sets.push('color = ?'); vals.push(color) }
    if (position !== undefined) { sets.push('position = ?'); vals.push(position) }

    if (sets.length) {
      vals.push(id)
      db.prepare(`UPDATE columns SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    }
  })()

  return ok(c, db.prepare('SELECT * FROM columns WHERE id = ?').get(id))
})

columns.delete('/columns/:id', (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const col = db.prepare('SELECT * FROM columns WHERE id = ?').get(id)
  if (!col) return err(c, 'column not found', 404)

  db.prepare('DELETE FROM columns WHERE id = ?').run(id)
  return ok(c, { id })
})

export default columns
