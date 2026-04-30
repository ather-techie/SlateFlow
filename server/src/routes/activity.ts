import { Hono } from 'hono'
import { db } from '../db/index.js'
import { ok, err, parseId } from '../lib/response.js'

const activity = new Hono()

// GET /cards/:id/activity — activity for a single card, newest first
activity.get('/cards/:id/activity', (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const card = db.prepare('SELECT id FROM cards WHERE id = ?').get(id)
  if (!card) return err(c, 'card not found', 404)

  const rows = db
    .prepare('SELECT * FROM activity_log WHERE card_id = ? ORDER BY created_at DESC')
    .all(id)
  return ok(c, rows)
})

// GET /projects/:id/activity — last 50 activity rows across all project cards
activity.get('/projects/:id/activity', (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(id)
  if (!project) return err(c, 'project not found', 404)

  const rows = db
    .prepare(
      `SELECT al.*
       FROM activity_log al
       JOIN cards c ON c.id = al.card_id
       LEFT JOIN columns col ON col.id = c.column_id
       LEFT JOIN swim_lanes sl ON sl.id = c.swim_lane_id
       WHERE col.project_id = ? OR sl.project_id = ?
       ORDER BY al.created_at DESC
       LIMIT 50`,
    )
    .all(id, id)
  return ok(c, rows)
})

export default activity
