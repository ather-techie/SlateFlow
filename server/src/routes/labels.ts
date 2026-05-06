import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId, zodErr } from '../lib/response.js'

const labels = new Hono()

const CreateLabelSchema = z.object({
  name: z.string().min(1, 'name is required').max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#6366f1'),
})

labels.get('/projects/:id/labels', async (c) => {
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const rows = await db.all('SELECT * FROM labels WHERE project_id = ? ORDER BY name', projectId)
  return ok(c, rows)
})

labels.post('/projects/:id/labels', async (c) => {
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = CreateLabelSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { name, color } = parsed.data
  const { lastID } = await db.run('INSERT INTO labels (project_id, name, color) VALUES (?, ?, ?)', projectId, name, color)

  const label = await db.get('SELECT * FROM labels WHERE id = ?', lastID)
  return ok(c, label, 201)
})

labels.get('/cards/:id/labels', async (c) => {
  const cardId = parseId(c.req.param('id'))
  if (!cardId) return err(c, 'invalid id', 400)

  const rows = await db.all(
    `SELECT l.* FROM labels l
     JOIN card_labels cl ON cl.label_id = l.id
     WHERE cl.card_id = ?
     ORDER BY l.name`,
    cardId,
  )
  return ok(c, rows)
})

labels.post('/cards/:id/labels', async (c) => {
  const cardId = parseId(c.req.param('id'))
  if (!cardId) return err(c, 'invalid id', 400)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = z.object({ label_id: z.number().int().positive() }).safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { label_id } = parsed.data
  try {
    await db.run('INSERT INTO card_labels (card_id, label_id) VALUES (?, ?)', cardId, label_id)
  } catch {
    // already exists — idempotent
  }

  return ok(c, { card_id: cardId, label_id })
})

labels.delete('/cards/:id/labels/:labelId', async (c) => {
  const cardId = parseId(c.req.param('id'))
  const labelId = parseId(c.req.param('labelId'))
  if (!cardId || !labelId) return err(c, 'invalid id', 400)

  await db.run('DELETE FROM card_labels WHERE card_id = ? AND label_id = ?', cardId, labelId)
  return ok(c, { card_id: cardId, label_id: labelId })
})

export default labels
