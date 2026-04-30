import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId, zodErr } from '../lib/response.js'

const cards = new Hono()

const CreateSchema = z.object({
  title: z.string().min(1, 'title is required').max(500),
  description: z.string().max(5000).optional().default(''),
  priority: z.enum(['p0', 'p1', 'p2', 'p3']).optional().default('p2'),
  story_points: z.number().int().min(0).max(999).nullable().optional(),
  assignee: z.string().max(200).nullable().optional(),
  sprint_id: z.number().int().positive().nullable().optional(),
})

const UpdateSchema = CreateSchema.partial()

const MoveSchema = z.object({
  column_id: z.number().int().positive('column_id is required'),
  position: z.number().int().min(0).optional(),
})

// ── list cards in a column ──────────────────────────────────────────────────
cards.get('/columns/:id/cards', (c) => {
  const columnId = parseId(c.req.param('id'))
  if (!columnId) return err(c, 'invalid id', 400)

  const col = db.prepare('SELECT id FROM columns WHERE id = ?').get(columnId)
  if (!col) return err(c, 'column not found', 404)

  const rows = db
    .prepare('SELECT * FROM cards WHERE column_id = ? ORDER BY position, id')
    .all(columnId)
  return ok(c, rows)
})

// ── create card in a column ─────────────────────────────────────────────────
cards.post('/columns/:id/cards', async (c) => {
  const columnId = parseId(c.req.param('id'))
  if (!columnId) return err(c, 'invalid id', 400)

  const col = db.prepare('SELECT id FROM columns WHERE id = ?').get(columnId)
  if (!col) return err(c, 'column not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { title, description, priority, story_points, assignee, sprint_id } = parsed.data
  const maxPos = (
    db
      .prepare('SELECT COALESCE(MAX(position), -1) as m FROM cards WHERE column_id = ?')
      .get(columnId) as { m: number }
  ).m

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO cards
         (column_id, sprint_id, title, description, priority, story_points, assignee, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(columnId, sprint_id ?? null, title, description, priority, story_points ?? null, assignee ?? null, maxPos + 1)

  db
    .prepare("INSERT INTO activity_log (card_id, action, meta) VALUES (?, 'create', ?)")
    .run(lastInsertRowid, JSON.stringify({ column_id: columnId }))

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(lastInsertRowid)
  return ok(c, card, 201)
})

// ── get single card ─────────────────────────────────────────────────────────
cards.get('/cards/:id', (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(id)
  if (!card) return err(c, 'card not found', 404)
  return ok(c, card)
})

// ── update card fields ──────────────────────────────────────────────────────
cards.patch('/cards/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(id)
  if (!card) return err(c, 'card not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const fields = parsed.data
  const sets: string[] = ["updated_at = datetime('now')"]
  const vals: unknown[] = []

  const allowed = ['title', 'description', 'priority', 'story_points', 'assignee', 'sprint_id'] as const
  for (const key of allowed) {
    if (key in fields && fields[key] !== undefined) {
      sets.push(`${key} = ?`)
      vals.push(fields[key] ?? null)
    }
  }

  if (sets.length === 1) return err(c, 'no fields to update', 400)

  vals.push(id)
  db.prepare(`UPDATE cards SET ${sets.join(', ')} WHERE id = ?`).run(...vals)

  const changedKeys = allowed.filter(key => key in fields && fields[key] !== undefined)
  db
    .prepare("INSERT INTO activity_log (card_id, action, meta) VALUES (?, 'update', ?)")
    .run(id, JSON.stringify(Object.fromEntries(changedKeys.map(k => [k, fields[k]]))))

  return ok(c, db.prepare('SELECT * FROM cards WHERE id = ?').get(id))
})

// ── get activity log ────────────────────────────────────────────────────────
cards.get('/cards/:id/activity', (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const card = db.prepare('SELECT id FROM cards WHERE id = ?').get(id)
  if (!card) return err(c, 'card not found', 404)

  const rows = db
    .prepare('SELECT * FROM activity_log WHERE card_id = ? ORDER BY created_at ASC')
    .all(id)
  return ok(c, rows)
})

// ── delete card ─────────────────────────────────────────────────────────────
cards.delete('/cards/:id', (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(id)
  if (!card) return err(c, 'card not found', 404)

  db.prepare('DELETE FROM cards WHERE id = ?').run(id)
  return ok(c, { id })
})

// ── move card to another column / reorder ───────────────────────────────────
cards.patch('/cards/:id/move', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as
    | { id: number; column_id: number }
    | undefined
  if (!card) return err(c, 'card not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = MoveSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { column_id, position } = parsed.data

  const col = db.prepare('SELECT id FROM columns WHERE id = ?').get(column_id)
  if (!col) return err(c, 'column not found', 404)

  db.transaction(() => {
    const siblings = db
      .prepare('SELECT id FROM cards WHERE column_id = ? AND id != ? ORDER BY position, id')
      .all(column_id, id) as { id: number }[]

    const ids = siblings.map((r) => r.id)
    const targetPos = position !== undefined
      ? Math.max(0, Math.min(position, ids.length))
      : ids.length
    ids.splice(targetPos, 0, id)

    const updatePos = db.prepare('UPDATE cards SET position = ? WHERE id = ?')
    for (let i = 0; i < ids.length; i++) updatePos.run(i, ids[i])

    db
      .prepare("UPDATE cards SET column_id = ?, updated_at = datetime('now') WHERE id = ?")
      .run(column_id, id)

    db
      .prepare("INSERT INTO activity_log (card_id, action, meta) VALUES (?, 'move', ?)")
      .run(id, JSON.stringify({ from_column_id: card.column_id, to_column_id: column_id, position: targetPos }))
  })()

  return ok(c, db.prepare('SELECT * FROM cards WHERE id = ?').get(id))
})

export default cards
