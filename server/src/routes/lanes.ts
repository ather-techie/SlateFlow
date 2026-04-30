import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId, zodErr } from '../lib/response.js'

const lanes = new Hono()

const HexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{3,6}$/, 'color must be a hex value')

const CreateSchema = z.object({
  name:     z.string().min(1, 'name is required').max(200),
  position: z.number().int().min(0).optional(),
  color:    HexColor.optional().default('#6366f1'),
})

const UpdateSchema = z.object({
  name:        z.string().min(1).max(200).optional(),
  color:       HexColor.optional(),
  position:    z.number().int().min(0).optional(),
  is_done_col: z.boolean().optional(),
})

const ReorderSchema = z.object({
  ordered_ids: z.array(z.number().int().positive()).min(1),
})

type LaneRow = { id: number; project_id: number; position: number }

// GET /projects/:id/lanes
lanes.get('/projects/:id/lanes', (c) => {
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
  if (!project) return err(c, 'project not found', 404)

  const rows = db
    .prepare('SELECT * FROM swim_lanes WHERE project_id = ? ORDER BY position, id')
    .all(projectId)
  return ok(c, rows)
})

// POST /projects/:id/lanes
lanes.post('/projects/:id/lanes', async (c) => {
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
  if (!project) return err(c, 'project not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { name, color } = parsed.data
  const { m: maxPos } = db
    .prepare('SELECT COALESCE(MAX(position), -1) as m FROM swim_lanes WHERE project_id = ?')
    .get(projectId) as { m: number }
  const position = parsed.data.position ?? maxPos + 1

  const { lastInsertRowid } = db
    .prepare('INSERT INTO swim_lanes (project_id, name, position, color) VALUES (?, ?, ?, ?)')
    .run(projectId, name, position, color)

  return ok(c, db.prepare('SELECT * FROM swim_lanes WHERE id = ?').get(lastInsertRowid), 201)
})

// PATCH /lanes/:id
lanes.patch('/lanes/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const lane = db.prepare('SELECT * FROM swim_lanes WHERE id = ?').get(id) as LaneRow | undefined
  if (!lane) return err(c, 'lane not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { name, color, position, is_done_col } = parsed.data

  db.transaction(() => {
    if (position !== undefined && position !== lane.position) {
      const dir = position < lane.position ? 1 : -1
      const [lo, hi] =
        position < lane.position
          ? [position, lane.position - 1]
          : [lane.position + 1, position]

      db.prepare(
        `UPDATE swim_lanes SET position = position + ?
         WHERE project_id = ? AND id != ? AND position BETWEEN ? AND ?`,
      ).run(dir, lane.project_id, id, lo, hi)
    }

    const sets: string[] = []
    const vals: unknown[] = []
    if (name        !== undefined) { sets.push('name = ?');        vals.push(name) }
    if (color       !== undefined) { sets.push('color = ?');       vals.push(color) }
    if (position    !== undefined) { sets.push('position = ?');    vals.push(position) }
    if (is_done_col !== undefined) { sets.push('is_done_col = ?'); vals.push(is_done_col ? 1 : 0) }

    if (sets.length) {
      vals.push(id)
      db.prepare(`UPDATE swim_lanes SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    }
  })()

  return ok(c, db.prepare('SELECT * FROM swim_lanes WHERE id = ?').get(id))
})

// DELETE /lanes/:id — rejected if lane has cards
lanes.delete('/lanes/:id', (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const lane = db.prepare('SELECT id FROM swim_lanes WHERE id = ?').get(id)
  if (!lane) return err(c, 'lane not found', 404)

  const { n: cardCount } = db
    .prepare('SELECT COUNT(*) as n FROM cards WHERE swim_lane_id = ?')
    .get(id) as { n: number }

  if (cardCount > 0) {
    return c.json(
      { data: null, error: `lane has ${cardCount} card(s); move or delete them first`, meta: { card_count: cardCount } },
      409,
    )
  }

  db.prepare('DELETE FROM swim_lanes WHERE id = ?').run(id)
  return ok(c, { id })
})

// POST /projects/:id/lanes/reorder — bulk reposition by ordered id list
lanes.post('/projects/:id/lanes/reorder', async (c) => {
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
  if (!project) return err(c, 'project not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = ReorderSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { ordered_ids } = parsed.data

  const projectLaneIds = new Set(
    (db.prepare('SELECT id FROM swim_lanes WHERE project_id = ?').all(projectId) as { id: number }[]).map(
      (r) => r.id,
    ),
  )

  if (!ordered_ids.every((lid) => projectLaneIds.has(lid))) {
    return err(c, 'one or more lane ids do not belong to this project', 400)
  }

  db.transaction(() => {
    const update = db.prepare('UPDATE swim_lanes SET position = ? WHERE id = ?')
    ordered_ids.forEach((laneId, idx) => update.run(idx, laneId))
  })()

  return ok(
    c,
    db.prepare('SELECT * FROM swim_lanes WHERE project_id = ? ORDER BY position, id').all(projectId),
  )
})

export default lanes
