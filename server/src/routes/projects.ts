import { Hono } from 'hono'
import { z } from 'zod'
import { db, seedProjectDefaults } from '../db/index.js'
import { ok, err, parseId, zodErr } from '../lib/response.js'
import { canWrite } from '../lib/projectAccess.js'

const projects = new Hono()

const HexColor = z.string().regex(/^#[0-9a-fA-F]{3,6}$/, 'color must be a hex value')

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

projects.get('/projects', async (c) => {
  const rows = await db.all(
    `SELECT p.*, COUNT(sl.id) as lane_count
     FROM projects p
     LEFT JOIN swim_lanes sl ON sl.project_id = p.id
     GROUP BY p.id
     ORDER BY p.created_at DESC`,
  )
  return ok(c, rows)
})

projects.post('/projects', async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { name, description, color, preset_id, custom_lanes } = parsed.data

  let laneNames: string[]
  if (preset_id !== undefined) {
    const preset = await db.get<{ lanes: string }>('SELECT lanes FROM lane_presets WHERE id = ?', preset_id)
    if (!preset) return err(c, 'lane preset not found', 404)
    laneNames = JSON.parse(preset.lanes) as string[]
  } else {
    laneNames = custom_lanes!
  }

  const result = await db.transaction(async () => {
    const { lastID: projectId } = await db.run(
      'INSERT INTO projects (name, description, color) VALUES (?, ?, ?)',
      name, description, color,
    )

    const swim_lanes = []
    for (let idx = 0; idx < laneNames.length; idx++) {
      const isDone = idx === laneNames.length - 1 ? 1 : 0
      const { lastID } = await db.run(
        'INSERT INTO swim_lanes (project_id, name, position, is_done_col) VALUES (?, ?, ?, ?)',
        projectId, laneNames[idx], idx, isDone,
      )
      swim_lanes.push(await db.get('SELECT * FROM swim_lanes WHERE id = ?', lastID))
    }

    await seedProjectDefaults(projectId)

    const project = await db.get('SELECT * FROM projects WHERE id = ?', projectId)
    return { ...(project as object), swim_lanes }
  })()

  return ok(c, result, 201)
})

projects.get('/projects/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const project = await db.get('SELECT * FROM projects WHERE id = ?', id)
  if (!project) return err(c, 'project not found', 404)

  const swim_lanes = await db.all('SELECT * FROM swim_lanes WHERE project_id = ? ORDER BY position, id', id)

  return ok(c, { ...(project as object), swim_lanes })
})

projects.patch('/projects/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const existing = await db.get('SELECT id FROM projects WHERE id = ?', id)
  if (!existing) return err(c, 'project not found', 404)

  const caller = c.get('user')
  if (!await canWrite(caller.id, id, caller.role)) {
    return err(c, 'forbidden', 403)
  }

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
    await db.run(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, ...vals)
  }

  return ok(c, await db.get('SELECT * FROM projects WHERE id = ?', id))
})

projects.delete('/projects/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const existing = await db.get<{ id: number; is_default: number }>('SELECT id, is_default FROM projects WHERE id = ?', id)
  if (!existing) return err(c, 'project not found', 404)
  if (existing.is_default) return err(c, 'Cannot delete the Default Project', 409)

  await db.run('DELETE FROM projects WHERE id = ?', id)
  return ok(c, { id })
})

export default projects
