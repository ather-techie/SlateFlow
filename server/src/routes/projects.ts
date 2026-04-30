import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId, zodErr } from '../lib/response.js'

const projects = new Hono()

const CreateSchema = z.object({
  name: z.string().min(1, 'name is required').max(200),
  description: z.string().max(2000).optional().default(''),
})

projects.get('/projects', (c) => {
  const rows = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all()
  return ok(c, rows)
})

projects.post('/projects', async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { name, description } = parsed.data
  const { lastInsertRowid } = db
    .prepare('INSERT INTO projects (name, description) VALUES (?, ?)')
    .run(name, description)

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(lastInsertRowid)
  return ok(c, project, 201)
})

projects.get('/projects/:id', (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
  if (!project) return err(c, 'project not found', 404)
  return ok(c, project)
})

projects.delete('/projects/:id', (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
  if (!project) return err(c, 'project not found', 404)

  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  return ok(c, { id })
})

export default projects
