import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId, zodErr } from '../lib/response.js'
import { emitBoardEvent } from '../lib/eventBus.js'

const comments = new Hono()

const CreateSchema = z.object({
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
  const user = c.get('user')
  const cardId = parseId(c.req.param('id'))
  if (!cardId) return err(c, 'invalid id', 400)

  const card = db.prepare('SELECT id, title FROM cards WHERE id = ?').get(cardId) as { id: number; title: string } | undefined
  if (!card) return err(c, 'card not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const text = parsed.data.body
  const author = user.display_name

  const { lastInsertRowid } = db
    .prepare('INSERT INTO comments (card_id, author, author_id, body) VALUES (?, ?, ?, ?)')
    .run(cardId, author, user.id, text)

  db.prepare("INSERT INTO activity_log (card_id, action, meta, user_id) VALUES (?, 'comment_added', ?, ?)")
    .run(cardId, JSON.stringify({ author }), user.id)

  // Detect @mentions and notify matched users
  const mentionPattern = /@([\w.-]+)/g
  const mentions: string[] = []
  let m: RegExpExecArray | null
  while ((m = mentionPattern.exec(text)) !== null) {
    mentions.push(m[1].toLowerCase())
  }

  if (mentions.length > 0) {
    const placeholders = mentions.map(() => '?').join(', ')
    const mentionedUsers = db.prepare(`
      SELECT id, display_name FROM users
      WHERE LOWER(REPLACE(REPLACE(display_name, ' ', ''), '.', '')) IN (${placeholders})
        AND deleted_at IS NULL AND id != ?
    `).all(...mentions, user.id) as { id: number; display_name: string }[]

    const insertNotif = db.prepare(
      "INSERT INTO notifications (user_id, type, entity_type, entity_id, message) VALUES (?, 'mention', 'comment', ?, ?)"
    )
    for (const mentioned of mentionedUsers) {
      insertNotif.run(mentioned.id, lastInsertRowid, `${author} mentioned you in a comment on "${card.title}"`)
      emitBoardEvent({ type: 'notification', userId: mentioned.id, data: { type: 'mention', card_id: cardId, comment_id: lastInsertRowid } })
    }
  }

  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(lastInsertRowid)
  return ok(c, comment, 201)
})

comments.delete('/comments/:id', (c) => {
  const user = c.get('user')
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as { id: number; author_id: number | null } | undefined
  if (!comment) return err(c, 'comment not found', 404)

  // Only the comment author or a super_admin can delete
  if (user.role !== 'super_admin' && comment.author_id !== user.id) return err(c, 'forbidden', 403)

  db.prepare('DELETE FROM comments WHERE id = ?').run(id)
  return ok(c, { id })
})

export default comments
