import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId } from '../lib/response.js'
import { canManageUsers } from '../lib/epicAccess.js'

const epicAccess = new Hono()

epicAccess.get('/epics/:id/access', (c) => {
  const user = c.get('user')
  const epicId = parseId(c.req.param('id'))
  if (!epicId) return err(c, 'invalid epic id', 404)

  if (!canManageUsers(user.id, epicId, user.role)) return err(c, 'forbidden', 403)

  const rows = db.prepare(`
    SELECT ea.id, ea.user_id, ea.epic_id, ea.role, ea.granted_by, ea.created_at,
           u.display_name, u.email
    FROM epic_access ea
    JOIN users u ON u.id = ea.user_id AND u.deleted_at IS NULL
    WHERE ea.epic_id = ?
    ORDER BY ea.created_at DESC
  `).all(epicId)
  return ok(c, rows)
})

epicAccess.post('/epics/:id/access', async (c) => {
  const user = c.get('user')
  const epicId = parseId(c.req.param('id'))
  if (!epicId) return err(c, 'invalid epic id', 404)

  if (!canManageUsers(user.id, epicId, user.role)) return err(c, 'forbidden', 403)

  const body = await c.req.json().catch(() => null)
  const parsed = z.object({
    user_id: z.number().int().positive(),
    role:    z.enum(['epic_admin', 'contributor', 'reader']),
  }).safeParse(body)
  if (!parsed.success) return err(c, 'invalid request body')

  const { user_id, role } = parsed.data

  if (role === 'epic_admin' && user.role !== 'super_admin') {
    return err(c, 'only super_admin can grant the epic_admin role', 403)
  }

  const targetUser = db.prepare('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL').get(user_id)
  if (!targetUser) return err(c, 'user not found', 404)

  try {
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO epic_access (user_id, epic_id, role, granted_by) VALUES (?, ?, ?, ?)'
    ).run(user_id, epicId, role, user.id)
    const row = db.prepare(`
      SELECT ea.id, ea.user_id, ea.epic_id, ea.role, ea.granted_by, ea.created_at,
             u.display_name, u.email
      FROM epic_access ea JOIN users u ON u.id = ea.user_id WHERE ea.id = ?
    `).get(lastInsertRowid)
    return ok(c, row, 201)
  } catch {
    return err(c, 'user already has access to this epic — use PATCH to update the role', 409)
  }
})

epicAccess.patch('/epics/:epicId/access/:userId', async (c) => {
  const user = c.get('user')
  const epicId = parseId(c.req.param('epicId'))
  const targetUserId = parseId(c.req.param('userId'))
  if (!epicId || !targetUserId) return err(c, 'invalid id', 404)

  if (!canManageUsers(user.id, epicId, user.role)) return err(c, 'forbidden', 403)

  const body = await c.req.json().catch(() => null)
  const parsed = z.object({ role: z.enum(['epic_admin', 'contributor', 'reader']) }).safeParse(body)
  if (!parsed.success) return err(c, 'invalid request body')

  if (parsed.data.role === 'epic_admin' && user.role !== 'super_admin') {
    return err(c, 'only super_admin can grant the epic_admin role', 403)
  }

  const existing = db.prepare('SELECT id FROM epic_access WHERE user_id = ? AND epic_id = ?').get(targetUserId, epicId)
  if (!existing) return err(c, 'access entry not found', 404)

  db.prepare("UPDATE epic_access SET role = ? WHERE user_id = ? AND epic_id = ?").run(parsed.data.role, targetUserId, epicId)
  const row = db.prepare(`
    SELECT ea.id, ea.user_id, ea.epic_id, ea.role, ea.granted_by, ea.created_at,
           u.display_name, u.email
    FROM epic_access ea JOIN users u ON u.id = ea.user_id WHERE ea.user_id = ? AND ea.epic_id = ?
  `).get(targetUserId, epicId)
  return ok(c, row)
})

epicAccess.delete('/epics/:epicId/access/:userId', (c) => {
  const user = c.get('user')
  const epicId = parseId(c.req.param('epicId'))
  const targetUserId = parseId(c.req.param('userId'))
  if (!epicId || !targetUserId) return err(c, 'invalid id', 404)

  if (!canManageUsers(user.id, epicId, user.role)) return err(c, 'forbidden', 403)

  const result = db.prepare('DELETE FROM epic_access WHERE user_id = ? AND epic_id = ?').run(targetUserId, epicId)
  if (result.changes === 0) return err(c, 'access entry not found', 404)
  return ok(c, { user_id: targetUserId, epic_id: epicId })
})

export default epicAccess
