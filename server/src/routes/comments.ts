import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId, zodErr } from '../lib/response.js'
import { emitBoardEvent } from '../lib/eventBus.js'
import { logActivity } from '../lib/activityLog.js'
import { notifyMentions } from '../lib/notifications.js'

const comments = new Hono()

const CreateSchema = z.object({
  body: z.string().min(1, 'body is required'),
})

comments.get('/cards/:id/comments', async (c) => {
  const cardId = parseId(c.req.param('id'))
  if (!cardId) return err(c, 'invalid id', 400)

  const card = await db.get('SELECT id FROM cards WHERE id = ?', cardId)
  if (!card) return err(c, 'card not found', 404)

  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 500) || 50
  const offset = Math.max(parseInt(c.req.query('offset') || '0', 10), 0) || 0

  const countRow = await db.get<{ total: number }>(
    'SELECT COUNT(*) as total FROM comments WHERE card_id = ?',
    cardId
  )
  const total = countRow?.total ?? 0

  const rows = await db.all(
    'SELECT * FROM comments WHERE card_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?',
    cardId, limit, offset
  )
  return ok(c, { items: rows, total, limit, offset })
})

comments.post('/cards/:id/comments', async (c) => {
  const user = c.get('user')
  const cardId = parseId(c.req.param('id'))
  if (!cardId) return err(c, 'invalid id', 400)

  const card = await db.get<{ id: number; title: string }>('SELECT id, title FROM cards WHERE id = ?', cardId)
  if (!card) return err(c, 'card not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const text = parsed.data.body
  const author = user.display_name

  const { lastID } = await db.run(
    'INSERT INTO comments (card_id, author, author_id, body) VALUES (?, ?, ?, ?)',
    cardId, author, user.id, text,
  )

  await logActivity(cardId, 'comment_added', { author }, user.id)

  await notifyMentions({
    commentBody: text,
    mentionedByName: author,
    mentionedById: user.id,
    cardId,
    cardTitle: card.title,
    commentId: lastID as number,
  })

  const comment = await db.get('SELECT * FROM comments WHERE id = ?', lastID)
  return ok(c, comment, 201)
})

comments.delete('/comments/:id', async (c) => {
  const user = c.get('user')
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const comment = await db.get<{ id: number; author_id: number | null }>('SELECT * FROM comments WHERE id = ?', id)
  if (!comment) return err(c, 'comment not found', 404)

  if (user.role !== 'super_admin' && comment.author_id !== user.id) return err(c, 'forbidden', 403)

  await db.run('DELETE FROM comments WHERE id = ?', id)
  return ok(c, { id })
})

export default comments
