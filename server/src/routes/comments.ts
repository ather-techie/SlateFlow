import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId, zodErr } from '../lib/response.js'
import { emitBoardEvent } from '../lib/eventBus.js'
import { isEnabled } from '../lib/featureFlags.js'
import { sendEmail, mentionEmailHtml } from '../lib/email.js'

const comments = new Hono()

const CreateSchema = z.object({
  body: z.string().min(1, 'body is required'),
})

comments.get('/cards/:id/comments', async (c) => {
  const cardId = parseId(c.req.param('id'))
  if (!cardId) return err(c, 'invalid id', 400)

  const card = await db.get('SELECT id FROM cards WHERE id = ?', cardId)
  if (!card) return err(c, 'card not found', 404)

  const rows = await db.all('SELECT * FROM comments WHERE card_id = ? ORDER BY created_at ASC', cardId)
  return ok(c, rows)
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

  await db.run(
    "INSERT INTO activity_log (card_id, action, meta, user_id) VALUES (?, 'comment_added', ?, ?)",
    cardId, JSON.stringify({ author }), user.id,
  )

  const mentionPattern = /@([\w.-]+)/g
  const mentions: string[] = []
  let m: RegExpExecArray | null
  while ((m = mentionPattern.exec(text)) !== null) {
    mentions.push(m[1].toLowerCase())
  }

  if (mentions.length > 0) {
    const placeholders = mentions.map(() => '?').join(', ')
    const mentionedUsers = await db.all<{ id: number; display_name: string; email: string; email_notifications: number }>(
      `SELECT id, display_name, email, email_notifications FROM users
       WHERE LOWER(REPLACE(REPLACE(display_name, ' ', ''), '.', '')) IN (${placeholders})
         AND deleted_at IS NULL AND id != ?`,
      ...mentions, user.id,
    )

    const emailEnabled = await isEnabled('email_notifications')

    for (const mentioned of mentionedUsers) {
      await db.run(
        "INSERT INTO notifications (user_id, type, entity_type, entity_id, message) VALUES (?, 'mention', 'comment', ?, ?)",
        mentioned.id, lastID, `${author} mentioned you in a comment on "${card.title}"`,
      )
      emitBoardEvent({ type: 'notification', userId: mentioned.id, data: { type: 'mention', card_id: cardId, comment_id: lastID } })

      if (emailEnabled && mentioned.email_notifications) {
        sendEmail({
          to: mentioned.email,
          subject: `${author} mentioned you on "${card.title}"`,
          html: mentionEmailHtml({
            mentionedBy: author,
            cardTitle: card.title,
            cardId,
            commentId: lastID as number,
          }),
        }).catch(console.error)
      }
    }
  }

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
