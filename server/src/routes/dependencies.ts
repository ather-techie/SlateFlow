import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId, zodErr } from '../lib/response.js'

const dependencies = new Hono()

const AddSchema = z.object({
  target_id: z.number().int().positive(),
  type: z.enum(['blocks', 'blocked_by']),
})

dependencies.get('/cards/:id/dependencies', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const card = await db.get('SELECT id FROM cards WHERE id = ?', id)
  if (!card) return err(c, 'card not found', 404)

  const blocks = await db.all(
    `SELECT d.id as dep_id, c.id, c.title, c.priority, c.story_points, c.assignee, c.swim_lane_id
     FROM story_dependencies d
     JOIN cards c ON c.id = d.blocked_id
     WHERE d.blocker_id = ?
     ORDER BY d.created_at`,
    id,
  )

  const blocked_by = await db.all(
    `SELECT d.id as dep_id, c.id, c.title, c.priority, c.story_points, c.assignee, c.swim_lane_id
     FROM story_dependencies d
     JOIN cards c ON c.id = d.blocker_id
     WHERE d.blocked_id = ?
     ORDER BY d.created_at`,
    id,
  )

  return ok(c, { blocks, blocked_by })
})

dependencies.post('/cards/:id/dependencies', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const card = await db.get('SELECT id FROM cards WHERE id = ?', id)
  if (!card) return err(c, 'card not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = AddSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { target_id, type } = parsed.data

  if (target_id === id) return err(c, 'a story cannot depend on itself', 400)

  const target = await db.get('SELECT id FROM cards WHERE id = ?', target_id)
  if (!target) return err(c, 'target card not found', 404)

  const blocker_id = type === 'blocks' ? id : target_id
  const blocked_id = type === 'blocks' ? target_id : id

  try {
    const { lastID } = await db.run(
      'INSERT INTO story_dependencies (blocker_id, blocked_id) VALUES (?, ?)',
      blocker_id, blocked_id,
    )
    const row = await db.get('SELECT * FROM story_dependencies WHERE id = ?', lastID)
    return ok(c, row, 201)
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('UNIQUE')) {
      return err(c, 'dependency already exists', 409)
    }
    throw e
  }
})

dependencies.delete('/dependencies/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const dep = await db.get('SELECT id FROM story_dependencies WHERE id = ?', id)
  if (!dep) return err(c, 'dependency not found', 404)

  await db.run('DELETE FROM story_dependencies WHERE id = ?', id)
  return ok(c, { id })
})

export default dependencies
