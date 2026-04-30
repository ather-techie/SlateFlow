import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId, zodErr } from '../lib/response.js'

const labels = new Hono()

const CreateLabelSchema = z.object({
  name: z.string().min(1, 'name is required').max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#6366f1'),
})

// ── list labels for a project ───────────────────────────────────────────────
labels.get('/projects/:id/labels', (c) => {
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const rows = db.prepare('SELECT * FROM labels WHERE project_id = ? ORDER BY name').all(projectId)
  return ok(c, rows)
})

// ── create a label ──────────────────────────────────────────────────────────
labels.post('/projects/:id/labels', async (c) => {
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = CreateLabelSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { name, color } = parsed.data
  const { lastInsertRowid } = db
    .prepare('INSERT INTO labels (project_id, name, color) VALUES (?, ?, ?)')
    .run(projectId, name, color)

  const label = db.prepare('SELECT * FROM labels WHERE id = ?').get(lastInsertRowid)
  return ok(c, label, 201)
})

// ── list labels on a card ───────────────────────────────────────────────────
labels.get('/cards/:id/labels', (c) => {
  const cardId = parseId(c.req.param('id'))
  if (!cardId) return err(c, 'invalid id', 400)

  const rows = db
    .prepare(`
      SELECT l.* FROM labels l
      JOIN card_labels cl ON cl.label_id = l.id
      WHERE cl.card_id = ?
      ORDER BY l.name
    `)
    .all(cardId)
  return ok(c, rows)
})

// ── add a label to a card ───────────────────────────────────────────────────
labels.post('/cards/:id/labels', async (c) => {
  const cardId = parseId(c.req.param('id'))
  if (!cardId) return err(c, 'invalid id', 400)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = z.object({ label_id: z.number().int().positive() }).safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { label_id } = parsed.data
  try {
    db.prepare('INSERT INTO card_labels (card_id, label_id) VALUES (?, ?)').run(cardId, label_id)
  } catch {
    // already exists — idempotent
  }

  return ok(c, { card_id: cardId, label_id })
})

// ── remove a label from a card ──────────────────────────────────────────────
labels.delete('/cards/:id/labels/:labelId', (c) => {
  const cardId = parseId(c.req.param('id'))
  const labelId = parseId(c.req.param('labelId'))
  if (!cardId || !labelId) return err(c, 'invalid id', 400)

  db.prepare('DELETE FROM card_labels WHERE card_id = ? AND label_id = ?').run(cardId, labelId)
  return ok(c, { card_id: cardId, label_id: labelId })
})

export default labels
