import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId, zodErr } from '../lib/response.js'

const comments = new Hono()

const CreateSchema = z.object({
  author: z.string().min(1, 'author is required').max(200),
  body: z.string().min(1, 'body is required'),
})

comments.get('/cards/:id/comments', (c) => {
  const cardId = parseId(c.req.param('id'))
  if (!cardId) return err(c, 'invalid id', 400)

  const card = db.prepare('SELECT id FROM cards WHERE id = ?').get(cardId)
  if (!card) return err(c, 'card not found', 404)

  const rows = db
    .prepare('SELECT * FROM comments WHERE card_id = ? ORDER BY created_at ASC')
    .all(cardId)
  return ok(c, rows)
})

comments.post('/cards/:id/comments', async (c) => {
  const cardId = parseId(c.req.param('id'))
  if (!cardId) return err(c, 'invalid id', 400)

  const card = db.prepare('SELECT id FROM cards WHERE id = ?').get(cardId)
  if (!card) return err(c, 'card not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { author, body: text } = parsed.data
  const { lastInsertRowid } = db
    .prepare('INSERT INTO comments (card_id, author, body) VALUES (?, ?, ?)')
    .run(cardId, author, text)

  db
    .prepare("INSERT INTO activity_log (card_id, action, meta) VALUES (?, 'comment_added', ?)")
    .run(cardId, JSON.stringify({ author }))

  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(lastInsertRowid)
  return ok(c, comment, 201)
})

comments.delete('/comments/:id', (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(id)
  if (!comment) return err(c, 'comment not found', 404)

  db.prepare('DELETE FROM comments WHERE id = ?').run(id)
  return ok(c, { id })
})

export default comments
