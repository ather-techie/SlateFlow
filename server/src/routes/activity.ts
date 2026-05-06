import { Hono } from 'hono'
import { db } from '../db/index.js'
import { ok, err, parseId } from '../lib/response.js'

const activity = new Hono()

activity.get('/cards/:id/activity', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const card = await db.get('SELECT id FROM cards WHERE id = ?', id)
  if (!card) return err(c, 'card not found', 404)

  const rows = await db.all('SELECT * FROM activity_log WHERE card_id = ? ORDER BY created_at DESC', id)
  return ok(c, rows)
})

activity.get('/projects/:id/activity', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const project = await db.get('SELECT id FROM projects WHERE id = ?', id)
  if (!project) return err(c, 'project not found', 404)

  const rows = await db.all(
    `SELECT al.*
     FROM activity_log al
     JOIN cards c ON c.id = al.card_id
     LEFT JOIN columns col ON col.id = c.column_id
     LEFT JOIN swim_lanes sl ON sl.id = c.swim_lane_id
     WHERE col.project_id = ? OR sl.project_id = ?
     ORDER BY al.created_at DESC
     LIMIT 50`,
    id, id,
  )
  return ok(c, rows)
})

export default activity
