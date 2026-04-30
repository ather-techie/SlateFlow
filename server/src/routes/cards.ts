import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId, zodErr } from '../lib/response.js'

const cards = new Hono()

const LaneCreateSchema = z.object({
  title:        z.string().min(1, 'title is required').max(500),
  description:  z.string().max(5000).optional().default(''),
  priority:     z.enum(['p0', 'p1', 'p2', 'p3']).optional().default('p2'),
  story_points: z.number().int().min(1).max(13).nullable().optional(),
  assignee:     z.string().max(200).nullable().optional(),
  sprint_id:    z.number().int().positive().nullable().optional(),
  label_ids:    z.array(z.number().int().positive()).optional(),
})

const ColCreateSchema = z.object({
  title:        z.string().min(1, 'title is required').max(500),
  description:  z.string().max(5000).optional().default(''),
  priority:     z.enum(['p0', 'p1', 'p2', 'p3']).optional().default('p2'),
  story_points: z.number().int().min(0).max(999).nullable().optional(),
  assignee:     z.string().max(200).nullable().optional(),
  sprint_id:    z.number().int().positive().nullable().optional(),
})

const UpdateSchema = z.object({
  title:        z.string().min(1).max(500).optional(),
  description:  z.string().max(5000).optional(),
  priority:     z.enum(['p0', 'p1', 'p2', 'p3']).optional(),
  story_points: z.number().int().min(0).max(999).nullable().optional(),
  assignee:     z.string().max(200).nullable().optional(),
  sprint_id:    z.number().int().positive().nullable().optional(),
})

const MoveSchema = z.object({
  lane_id:  z.number().int().positive('lane_id is required'),
  position: z.number().int().min(0).optional(),
})

type CardRow = { id: number; column_id: number | null; swim_lane_id: number | null }

// ── list cards in a swim lane ───────────────────────────────────────────────
cards.get('/lanes/:id/cards', (c) => {
  const laneId = parseId(c.req.param('id'))
  if (!laneId) return err(c, 'invalid id', 400)

  const lane = db.prepare('SELECT id FROM swim_lanes WHERE id = ?').get(laneId)
  if (!lane) return err(c, 'lane not found', 404)

  const rows = db
    .prepare('SELECT * FROM cards WHERE swim_lane_id = ? ORDER BY position, id')
    .all(laneId)
  return ok(c, rows)
})

// ── create card in a swim lane ──────────────────────────────────────────────
cards.post('/lanes/:id/cards', async (c) => {
  const laneId = parseId(c.req.param('id'))
  if (!laneId) return err(c, 'invalid id', 400)

  const lane = db.prepare('SELECT id FROM swim_lanes WHERE id = ?').get(laneId)
  if (!lane) return err(c, 'lane not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = LaneCreateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { title, description, priority, story_points, assignee, sprint_id, label_ids } = parsed.data

  const maxPos = (
    db.prepare('SELECT COALESCE(MAX(position), -1) as m FROM cards WHERE swim_lane_id = ?')
      .get(laneId) as { m: number }
  ).m

  const result = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO cards
           (swim_lane_id, sprint_id, title, description, priority, story_points, assignee, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(laneId, sprint_id ?? null, title, description, priority, story_points ?? null, assignee ?? null, maxPos + 1)

    const cardId = lastInsertRowid

    if (label_ids?.length) {
      const insertLabel = db.prepare('INSERT OR IGNORE INTO card_labels (card_id, label_id) VALUES (?, ?)')
      for (const labelId of label_ids) insertLabel.run(cardId, labelId)
    }

    db.prepare("INSERT INTO activity_log (card_id, action, meta) VALUES (?, 'create', ?)")
      .run(cardId, JSON.stringify({ swim_lane_id: laneId }))

    return db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId)
  })()

  return ok(c, result, 201)
})

// ── list cards in a column (legacy) ────────────────────────────────────────
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

// ── create card in a column (legacy) ───────────────────────────────────────
cards.post('/columns/:id/cards', async (c) => {
  const columnId = parseId(c.req.param('id'))
  if (!columnId) return err(c, 'invalid id', 400)

  const col = db.prepare('SELECT id FROM columns WHERE id = ?').get(columnId)
  if (!col) return err(c, 'column not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = ColCreateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { title, description, priority, story_points, assignee, sprint_id } = parsed.data
  const maxPos = (
    db.prepare('SELECT COALESCE(MAX(position), -1) as m FROM cards WHERE column_id = ?')
      .get(columnId) as { m: number }
  ).m

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO cards
         (column_id, sprint_id, title, description, priority, story_points, assignee, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(columnId, sprint_id ?? null, title, description, priority, story_points ?? null, assignee ?? null, maxPos + 1)

  db.prepare("INSERT INTO activity_log (card_id, action, meta) VALUES (?, 'create', ?)")
    .run(lastInsertRowid, JSON.stringify({ column_id: columnId }))

  return ok(c, db.prepare('SELECT * FROM cards WHERE id = ?').get(lastInsertRowid), 201)
})

// ── get single card with labels, comments, activity ─────────────────────────
cards.get('/cards/:id', (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(id)
  if (!card) return err(c, 'card not found', 404)

  const labels = db
    .prepare(
      `SELECT l.* FROM labels l
       JOIN card_labels cl ON cl.label_id = l.id
       WHERE cl.card_id = ?
       ORDER BY l.id`,
    )
    .all(id)

  const comments = db
    .prepare('SELECT * FROM comments WHERE card_id = ? ORDER BY created_at ASC')
    .all(id)

  const activity = db
    .prepare('SELECT * FROM activity_log WHERE card_id = ? ORDER BY created_at DESC')
    .all(id)

  return ok(c, { ...(card as object), labels, comments, activity })
})

// ── update card fields ──────────────────────────────────────────────────────
cards.patch('/cards/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const existing = db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!existing) return err(c, 'card not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const fields = parsed.data
  const sets: string[] = ["updated_at = datetime('now')"]
  const vals: unknown[] = []

  const allowed = ['title', 'description', 'priority', 'story_points', 'assignee', 'sprint_id'] as const
  for (const key of allowed) {
    if (key in fields) {
      sets.push(`${key} = ?`)
      vals.push(fields[key] ?? null)
    }
  }

  if (sets.length === 1) return err(c, 'no fields to update', 400)

  vals.push(id)
  db.prepare(`UPDATE cards SET ${sets.join(', ')} WHERE id = ?`).run(...vals)

  const insertActivity = db.prepare(
    "INSERT INTO activity_log (card_id, action, meta) VALUES (?, 'field_changed', ?)",
  )
  db.transaction(() => {
    for (const key of allowed) {
      if (key in fields) {
        insertActivity.run(id, JSON.stringify({ field: key, from: existing[key] ?? null, to: fields[key] ?? null }))
      }
    }
  })()

  return ok(c, db.prepare('SELECT * FROM cards WHERE id = ?').get(id))
})

// ── delete card ─────────────────────────────────────────────────────────────
cards.delete('/cards/:id', (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const card = db.prepare('SELECT id FROM cards WHERE id = ?').get(id)
  if (!card) return err(c, 'card not found', 404)

  db.prepare('DELETE FROM cards WHERE id = ?').run(id)
  return ok(c, { id })
})

// ── move card to a swim lane + reorder ──────────────────────────────────────
cards.patch('/cards/:id/move', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as CardRow | undefined
  if (!card) return err(c, 'card not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = MoveSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { lane_id, position } = parsed.data

  const lane = db.prepare('SELECT id FROM swim_lanes WHERE id = ?').get(lane_id)
  if (!lane) return err(c, 'lane not found', 404)

  db.transaction(() => {
    const siblings = db
      .prepare('SELECT id FROM cards WHERE swim_lane_id = ? AND id != ? ORDER BY position, id')
      .all(lane_id, id) as { id: number }[]

    const ids = siblings.map((r) => r.id)
    const targetPos = position !== undefined
      ? Math.max(0, Math.min(position, ids.length))
      : ids.length
    ids.splice(targetPos, 0, id)

    const updatePos = db.prepare('UPDATE cards SET position = ? WHERE id = ?')
    for (let i = 0; i < ids.length; i++) updatePos.run(i, ids[i])

    db.prepare("UPDATE cards SET swim_lane_id = ?, updated_at = datetime('now') WHERE id = ?")
      .run(lane_id, id)

    db.prepare("INSERT INTO activity_log (card_id, action, meta) VALUES (?, 'move', ?)")
      .run(id, JSON.stringify({ from_lane_id: card.swim_lane_id, to_lane_id: lane_id, position: targetPos }))
  })()

  return ok(c, db.prepare('SELECT * FROM cards WHERE id = ?').get(id))
})

export default cards
