import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId, zodErr } from '../lib/response.js'
import { emitBoardEvent } from '../lib/eventBus.js'
import { requireFeature } from '../middleware/requireRole.js'
import { canRead, canWrite } from '../lib/projectAccess.js'

const retro = new Hono()

retro.use('/sprints/:sprintId/retrospective', requireFeature('retrospective'))
retro.use('/retrospectives/*', requireFeature('retrospective'))
retro.use('/retrospective-items/*', requireFeature('retrospective'))

const Category = z.enum(['went_well', 'to_improve', 'action'])

const ItemCreateSchema = z.object({
  category: Category,
  body:     z.string().min(1, 'body is required').max(2000),
})

const ItemUpdateSchema = z.object({
  body:     z.string().min(1).max(2000).optional(),
  category: Category.optional(),
  position: z.number().int().min(0).optional(),
})

const ReorderSchema = z.object({
  category: Category,
  item_ids: z.array(z.number().int().positive()).min(1),
})

type SprintRow = { id: number; project_id: number }
type RetroRow = { id: number; sprint_id: number; created_at: string; updated_at: string }
type ItemRow = {
  id: number
  retrospective_id: number
  category: 'went_well' | 'to_improve' | 'action'
  body: string
  position: number
  author_id: number | null
  created_at: string
  updated_at: string
}

async function loadRetroContext(retroId: number) {
  const r = await db.get<{ id: number; sprint_id: number; project_id: number }>(
    `SELECT r.id, r.sprint_id, s.project_id
       FROM retrospectives r
       JOIN sprints s ON s.id = r.sprint_id
      WHERE r.id = ?`,
    retroId,
  )
  return r
}

async function loadItemContext(itemId: number) {
  const r = await db.get<{ id: number; retrospective_id: number; sprint_id: number; project_id: number }>(
    `SELECT i.id, i.retrospective_id, r.sprint_id, s.project_id
       FROM retrospective_items i
       JOIN retrospectives r ON r.id = i.retrospective_id
       JOIN sprints s ON s.id = r.sprint_id
      WHERE i.id = ?`,
    itemId,
  )
  return r
}

retro.get('/sprints/:sprintId/retrospective', async (c) => {
  const sprintId = parseId(c.req.param('sprintId'))
  if (!sprintId) return err(c, 'invalid id', 400)

  const sprint = await db.get<SprintRow>('SELECT id, project_id FROM sprints WHERE id = ?', sprintId)
  if (!sprint) return err(c, 'sprint not found', 404)

  if (!canRead()) return err(c, 'forbidden', 403)

  let retrospective = await db.get<RetroRow>(
    'SELECT * FROM retrospectives WHERE sprint_id = ?',
    sprintId,
  )

  if (!retrospective) {
    const { lastID } = await db.run(
      'INSERT INTO retrospectives (sprint_id) VALUES (?)',
      sprintId,
    )
    retrospective = await db.get<RetroRow>('SELECT * FROM retrospectives WHERE id = ?', lastID)
  }

  const items = await db.all<ItemRow>(
    'SELECT * FROM retrospective_items WHERE retrospective_id = ? ORDER BY category, position, id',
    retrospective!.id,
  )

  return ok(c, { retrospective, items })
})

retro.post('/retrospectives/:id/items', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const ctx = await loadRetroContext(id)
  if (!ctx) return err(c, 'retrospective not found', 404)

  const user = c.get('user')
  if (!(await canWrite(user.id, ctx.project_id, user.role))) return err(c, 'forbidden', 403)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = ItemCreateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const maxPosRow = await db.get<{ m: number }>(
    'SELECT COALESCE(MAX(position), -1) as m FROM retrospective_items WHERE retrospective_id = ? AND category = ?',
    id, parsed.data.category,
  )

  const { lastID } = await db.run(
    `INSERT INTO retrospective_items (retrospective_id, category, body, position, author_id)
     VALUES (?, ?, ?, ?, ?)`,
    id, parsed.data.category, parsed.data.body, (maxPosRow?.m ?? -1) + 1, user.id,
  )

  await db.run("UPDATE retrospectives SET updated_at = datetime('now') WHERE id = ?", id)

  const item = await db.get<ItemRow>('SELECT * FROM retrospective_items WHERE id = ?', lastID)
  emitBoardEvent({ type: 'retro:item:created', projectId: ctx.project_id, data: item })
  return ok(c, item, 201)
})

retro.patch('/retrospective-items/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const ctx = await loadItemContext(id)
  if (!ctx) return err(c, 'item not found', 404)

  const user = c.get('user')
  if (!(await canWrite(user.id, ctx.project_id, user.role))) return err(c, 'forbidden', 403)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = ItemUpdateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const fields = parsed.data
  const sets: string[] = ["updated_at = datetime('now')"]
  const vals: unknown[] = []

  if (fields.body !== undefined)     { sets.push('body = ?');     vals.push(fields.body) }
  if (fields.category !== undefined) { sets.push('category = ?'); vals.push(fields.category) }
  if (fields.position !== undefined) { sets.push('position = ?'); vals.push(fields.position) }

  if (sets.length === 1) return err(c, 'no fields to update', 400)

  vals.push(id)
  await db.run(`UPDATE retrospective_items SET ${sets.join(', ')} WHERE id = ?`, ...vals)
  await db.run("UPDATE retrospectives SET updated_at = datetime('now') WHERE id = ?", ctx.retrospective_id)

  const item = await db.get<ItemRow>('SELECT * FROM retrospective_items WHERE id = ?', id)
  emitBoardEvent({ type: 'retro:item:updated', projectId: ctx.project_id, data: item })
  return ok(c, item)
})

retro.delete('/retrospective-items/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const ctx = await loadItemContext(id)
  if (!ctx) return err(c, 'item not found', 404)

  const user = c.get('user')
  if (!(await canWrite(user.id, ctx.project_id, user.role))) return err(c, 'forbidden', 403)

  await db.run('DELETE FROM retrospective_items WHERE id = ?', id)
  await db.run("UPDATE retrospectives SET updated_at = datetime('now') WHERE id = ?", ctx.retrospective_id)

  emitBoardEvent({ type: 'retro:item:deleted', projectId: ctx.project_id, data: { id, retrospective_id: ctx.retrospective_id } })
  return ok(c, { id })
})

retro.post('/retrospectives/:id/reorder', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const ctx = await loadRetroContext(id)
  if (!ctx) return err(c, 'retrospective not found', 404)

  const user = c.get('user')
  if (!(await canWrite(user.id, ctx.project_id, user.role))) return err(c, 'forbidden', 403)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = ReorderSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { category, item_ids } = parsed.data

  const ownedIds = new Set(
    (await db.all<{ id: number }>(
      'SELECT id FROM retrospective_items WHERE retrospective_id = ? AND category = ?',
      id, category,
    )).map(r => r.id),
  )

  if (!item_ids.every((iid) => ownedIds.has(iid))) {
    return err(c, 'one or more item ids do not belong to this retrospective category', 400)
  }

  await db.transaction(async () => {
    for (let idx = 0; idx < item_ids.length; idx++) {
      await db.run(
        "UPDATE retrospective_items SET position = ?, updated_at = datetime('now') WHERE id = ?",
        idx, item_ids[idx],
      )
    }
  })()

  const items = await db.all<ItemRow>(
    'SELECT * FROM retrospective_items WHERE retrospective_id = ? ORDER BY category, position, id',
    id,
  )

  for (const item of items.filter(i => item_ids.includes(i.id))) {
    emitBoardEvent({ type: 'retro:item:updated', projectId: ctx.project_id, data: item })
  }

  return ok(c, items)
})

export default retro
