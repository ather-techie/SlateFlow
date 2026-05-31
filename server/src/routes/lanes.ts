import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId, zodErr } from '../lib/response.js'
import { buildUpdate } from '../lib/buildUpdate.js'

const lanes = new Hono()

const HexColor = z.string().regex(/^#[0-9a-fA-F]{3,6}$/, 'color must be a hex value')

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

lanes.get('/projects/:id/lanes', async (c) => {
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = await db.get('SELECT id FROM projects WHERE id = ?', projectId)
  if (!project) return err(c, 'project not found', 404)

  const rows = await db.all('SELECT * FROM swim_lanes WHERE project_id = ? ORDER BY position, id', projectId)
  return ok(c, rows)
})

lanes.post('/projects/:id/lanes', async (c) => {
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
    'SELECT COALESCE(MAX(position), -1) as m FROM swim_lanes WHERE project_id = ?',
    projectId,
  )
  const position = parsed.data.position ?? (maxPosRow?.m ?? -1) + 1

  const { lastID } = await db.run(
    'INSERT INTO swim_lanes (project_id, name, position, color) VALUES (?, ?, ?, ?)',
    projectId, name, position, color,
  )

  return ok(c, await db.get('SELECT * FROM swim_lanes WHERE id = ?', lastID), 201)
})

lanes.patch('/lanes/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const lane = await db.get<LaneRow>('SELECT * FROM swim_lanes WHERE id = ?', id)
  if (!lane) return err(c, 'lane not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { name, color, position, is_done_col } = parsed.data

  await db.transaction(async () => {
    if (position !== undefined && position !== lane.position) {
      const dir = position < lane.position ? 1 : -1
      const [lo, hi] =
        position < lane.position
          ? [position, lane.position - 1]
          : [lane.position + 1, position]

      await db.run(
        `UPDATE swim_lanes SET position = position + ?
         WHERE project_id = ? AND id != ? AND position BETWEEN ? AND ?`,
        dir, lane.project_id, id, lo, hi,
      )
    }

    const updateFields: Record<string, unknown> = {}
    if (name !== undefined) updateFields.name = name
    if (color !== undefined) updateFields.color = color
    if (position !== undefined) updateFields.position = position
    if (is_done_col !== undefined) updateFields.is_done_col = is_done_col ? 1 : 0

    const upd = buildUpdate(updateFields, ['name', 'color', 'position', 'is_done_col'], { withTimestamp: false })
    if (upd) {
      upd.params.push(id)
      await db.run(`UPDATE swim_lanes SET ${upd.sql} WHERE id = ?`, ...upd.params)
    }
  })()

  return ok(c, await db.get('SELECT * FROM swim_lanes WHERE id = ?', id))
})

lanes.delete('/lanes/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const lane = await db.get('SELECT id FROM swim_lanes WHERE id = ?', id)
  if (!lane) return err(c, 'lane not found', 404)

  const countRow = await db.get<{ n: number }>('SELECT COUNT(*) as n FROM cards WHERE swim_lane_id = ?', id)
  const cardCount = countRow?.n ?? 0

  if (cardCount > 0) {
    return c.json(
      { data: null, error: `lane has ${cardCount} card(s); move or delete them first`, meta: { card_count: cardCount } },
      409,
    )
  }

  await db.run('DELETE FROM swim_lanes WHERE id = ?', id)
  return ok(c, { id })
})

lanes.post('/projects/:id/lanes/reorder', async (c) => {
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = await db.get('SELECT id FROM projects WHERE id = ?', projectId)
  if (!project) return err(c, 'project not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = ReorderSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { ordered_ids } = parsed.data

  const projectLaneIds = new Set(
    (await db.all<{ id: number }>('SELECT id FROM swim_lanes WHERE project_id = ?', projectId)).map(r => r.id),
  )

  if (!ordered_ids.every((lid) => projectLaneIds.has(lid))) {
    return err(c, 'one or more lane ids do not belong to this project', 400)
  }

  await db.transaction(async () => {
    for (let idx = 0; idx < ordered_ids.length; idx++) {
      await db.run('UPDATE swim_lanes SET position = ? WHERE id = ?', idx, ordered_ids[idx])
    }
  })()

  return ok(
    c,
    await db.all('SELECT * FROM swim_lanes WHERE project_id = ? ORDER BY position, id', projectId),
  )
})

export default lanes
