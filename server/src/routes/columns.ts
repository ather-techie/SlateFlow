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

columns.get('/projects/:id/columns', async (c) => {
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = await db.get('SELECT id FROM projects WHERE id = ?', projectId)
  if (!project) return err(c, 'project not found', 404)

  const rows = await db.all('SELECT * FROM columns WHERE project_id = ? ORDER BY position, id', projectId)
  return ok(c, rows)
})

columns.post('/projects/:id/columns', async (c) => {
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = await db.get('SELECT id FROM projects WHERE id = ?', projectId)
  if (!project) return err(c, 'project not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { name, color } = parsed.data
  const maxPosRow = await db.get<{ m: number }>(
    'SELECT COALESCE(MAX(position), -1) as m FROM columns WHERE project_id = ?',
    projectId,
  )
  const position = parsed.data.position ?? (maxPosRow?.m ?? -1) + 1

  const { lastID } = await db.run(
    'INSERT INTO columns (project_id, name, position, color) VALUES (?, ?, ?, ?)',
    projectId, name, position, color,
  )

  const col = await db.get('SELECT * FROM columns WHERE id = ?', lastID)
  return ok(c, col, 201)
})

columns.patch('/columns/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const col = await db.get<{ id: number; project_id: number; position: number }>(
    'SELECT * FROM columns WHERE id = ?',
    id,
  )
  if (!col) return err(c, 'column not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { name, color, position } = parsed.data

  await db.transaction(async () => {
    if (position !== undefined && position !== col.position) {
      const dir = position < col.position ? 1 : -1
      const [lo, hi] =
        position < col.position
          ? [position, col.position - 1]
          : [col.position + 1, position]

      await db.run(
        `UPDATE columns SET position = position + ?
         WHERE project_id = ? AND id != ? AND position BETWEEN ? AND ?`,
        dir, col.project_id, id, lo, hi,
      )
    }

    const sets: string[] = []
    const vals: unknown[] = []
    if (name     !== undefined) { sets.push('name = ?');     vals.push(name) }
    if (color    !== undefined) { sets.push('color = ?');    vals.push(color) }
    if (position !== undefined) { sets.push('position = ?'); vals.push(position) }

    if (sets.length) {
      vals.push(id)
      await db.run(`UPDATE columns SET ${sets.join(', ')} WHERE id = ?`, ...vals)
    }
  })()

  return ok(c, await db.get('SELECT * FROM columns WHERE id = ?', id))
})

columns.delete('/columns/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const col = await db.get('SELECT * FROM columns WHERE id = ?', id)
  if (!col) return err(c, 'column not found', 404)

  await db.run('DELETE FROM columns WHERE id = ?', id)
  return ok(c, { id })
})

export default columns
