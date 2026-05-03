import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId, zodErr } from '../lib/response.js'

const projects = new Hono()

const HexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{3,6}$/, 'color must be a hex value')

const CreateSchema = z
  .object({
    name:         z.string().min(1, 'name is required').max(200),
    description:  z.string().max(2000).optional().default(''),
    color:        HexColor.optional().default('#6366f1'),
    preset_id:    z.number().int().positive().optional(),
    custom_lanes: z.array(z.string().min(1).max(200)).min(2).max(12).optional(),
  })
  .refine((d) => d.preset_id !== undefined || d.custom_lanes !== undefined, {
    message: 'either preset_id or custom_lanes is required',
  })
  .refine((d) => !(d.preset_id !== undefined && d.custom_lanes !== undefined), {
    message: 'only one of preset_id or custom_lanes may be provided',
  })

const UpdateSchema = z.object({
  name:        z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  color:       HexColor.optional(),
})

// GET /projects — list all projects with lane count
projects.get('/projects', (c) => {
  const rows = db
    .prepare(
      `SELECT p.*, COUNT(sl.id) as lane_count
       FROM projects p
       LEFT JOIN swim_lanes sl ON sl.project_id = p.id
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
    )
    .all()
  return ok(c, rows)
})

// POST /projects — create project + swim lanes
projects.post('/projects', async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { name, description, color, preset_id, custom_lanes } = parsed.data

  let laneNames: string[]
  if (preset_id !== undefined) {
    const preset = db.prepare('SELECT lanes FROM lane_presets WHERE id = ?').get(preset_id) as
      | { lanes: string }
      | undefined
    if (!preset) return err(c, 'lane preset not found', 404)
    laneNames = JSON.parse(preset.lanes) as string[]
  } else {
    laneNames = custom_lanes!
  }

  const result = db.transaction(() => {
    const { lastInsertRowid: projectId } = db
      .prepare('INSERT INTO projects (name, description, color) VALUES (?, ?, ?)')
      .run(name, description, color)

    const insertLane = db.prepare(
      'INSERT INTO swim_lanes (project_id, name, position, is_done_col) VALUES (?, ?, ?, ?)',
    )
    const getLane = db.prepare('SELECT * FROM swim_lanes WHERE id = ?')

    const swim_lanes = laneNames.map((laneName, idx) => {
      const isDone = idx === laneNames.length - 1 ? 1 : 0
      const { lastInsertRowid } = insertLane.run(projectId, laneName, idx, isDone)
      return getLane.get(lastInsertRowid)
    })

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

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId)
    return { ...(project as object), swim_lanes }
  })()

  return ok(c, result, 201)
})

// GET /projects/:id — project detail + swim lanes
projects.get('/projects/:id', (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
  if (!project) return err(c, 'project not found', 404)

  const swim_lanes = db
    .prepare('SELECT * FROM swim_lanes WHERE project_id = ? ORDER BY position, id')
    .all(id)

  return ok(c, { ...(project as object), swim_lanes })
})

// PATCH /projects/:id — update name, description, color
projects.patch('/projects/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get(id)
  if (!existing) return err(c, 'project not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { name, description, color } = parsed.data
  const sets: string[] = []
  const vals: unknown[] = []
  if (name        !== undefined) { sets.push('name = ?');        vals.push(name) }
  if (description !== undefined) { sets.push('description = ?'); vals.push(description) }
  if (color       !== undefined) { sets.push('color = ?');       vals.push(color) }

  if (sets.length) {
    vals.push(id)
    db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  }

  return ok(c, db.prepare('SELECT * FROM projects WHERE id = ?').get(id))
})

// DELETE /projects/:id — cascade handled by FK; Default Project cannot be deleted
projects.delete('/projects/:id', (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const existing = db.prepare('SELECT id, is_default FROM projects WHERE id = ?').get(id) as
    | { id: number; is_default: number }
    | undefined
  if (!existing) return err(c, 'project not found', 404)
  if (existing.is_default) return err(c, 'Cannot delete the Default Project', 409)

  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  return ok(c, { id })
})

export default projects
