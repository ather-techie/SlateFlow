import { Hono } from 'hono'
import { db } from '../db/index.js'
import { ok, err, parseId } from '../lib/response.js'

const notifications = new Hono()

notifications.get('/notifications', async (c) => {
  const user = c.get('user')
  const unreadOnly = c.req.query('unread_only') === '1'

  const rows = await db.all(
    `SELECT id, type, entity_type, entity_id, message, is_read, created_at
     FROM notifications
     WHERE user_id = ? ${unreadOnly ? 'AND is_read = 0' : ''}
     ORDER BY created_at DESC
     LIMIT 50`,
    user.id,
  )
  return ok(c, rows)
})

notifications.patch('/notifications/read-all', async (c) => {
  const user = c.get('user')
  const result = await db.run(
    'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
    user.id,
  )
  return ok(c, { count: result.changes })
})

notifications.patch('/notifications/:id/read', async (c) => {
  const user = c.get('user')
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 404)

  const result = await db.run(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
    id, user.id,
  )
  if (result.changes === 0) return err(c, 'notification not found', 404)
  return ok(c, { id })
})

export default notifications
