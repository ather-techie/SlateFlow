import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId } from '../lib/response.js'
import { canManageUsers } from '../lib/projectAccess.js'

const projectAccess = new Hono()

projectAccess.get('/projects/:id/access', async (c) => {
  const caller = c.get('user')
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid project id', 404)

  if (!await canManageUsers(caller.id, projectId, caller.role)) {
    return err(c, 'forbidden', 403)
  }

  const rows = await db.all(
    `SELECT pa.id, pa.user_id, pa.project_id, pa.role, pa.granted_by, pa.created_at,
            u.display_name, u.email
     FROM project_access pa
     JOIN users u ON u.id = pa.user_id AND u.deleted_at IS NULL
     WHERE pa.project_id = ?
     ORDER BY pa.created_at DESC`,
    projectId,
  )

  return ok(c, rows)
})

projectAccess.post('/projects/:id/access', async (c) => {
  const caller = c.get('user')
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid project id', 404)

  if (!await canManageUsers(caller.id, projectId, caller.role)) {
    return err(c, 'forbidden', 403)
  }

  const body = await c.req.json().catch(() => null)
  const parsed = z.object({
    user_id: z.number().int(),
    role: z.enum(['project_admin', 'contributor', 'reader']),
  }).safeParse(body)
  if (!parsed.success) return err(c, 'invalid request body')

  const { user_id, role } = parsed.data

  if (caller.role !== 'super_admin' && role === 'project_admin') {
    return err(c, 'only super_admin can assign project_admin role', 403)
  }

  const existing = await db.get(
    'SELECT id FROM project_access WHERE user_id = ? AND project_id = ?',
    user_id, projectId,
  )
  if (existing) return err(c, 'user already has access — use PATCH to update', 409)

  const { lastID } = await db.run(
    'INSERT INTO project_access (user_id, project_id, role, granted_by) VALUES (?, ?, ?, ?)',
    user_id, projectId, role, caller.id,
  )

  const row = await db.get(
    `SELECT pa.id, pa.user_id, pa.project_id, pa.role, pa.granted_by, pa.created_at,
            u.display_name, u.email
     FROM project_access pa
     JOIN users u ON u.id = pa.user_id
     WHERE pa.id = ?`,
    lastID,
  )

  return ok(c, row, 201)
})

projectAccess.patch('/projects/:id/access/:userId', async (c) => {
  const caller = c.get('user')
  const projectId = parseId(c.req.param('id'))
  const userId = parseId(c.req.param('userId'))
  if (!projectId || !userId) return err(c, 'invalid id', 404)

  if (!await canManageUsers(caller.id, projectId, caller.role)) {
    return err(c, 'forbidden', 403)
  }

  if (caller.id === userId) {
    return err(c, 'cannot change your own role', 403)
  }

  const body = await c.req.json().catch(() => null)
  const parsed = z.object({
    role: z.enum(['project_admin', 'contributor', 'reader']),
  }).safeParse(body)
  if (!parsed.success) return err(c, 'invalid request body')

  const { role } = parsed.data

  if (caller.role !== 'super_admin' && role === 'project_admin') {
    return err(c, 'only super_admin can assign project_admin role', 403)
  }

  const existing = await db.get(
    'SELECT id FROM project_access WHERE user_id = ? AND project_id = ?',
    userId, projectId,
  )
  if (!existing) return err(c, 'no access entry found', 404)

  await db.run(
    'UPDATE project_access SET role = ? WHERE user_id = ? AND project_id = ?',
    role, userId, projectId,
  )

  const row = await db.get(
    `SELECT pa.id, pa.user_id, pa.project_id, pa.role, pa.granted_by, pa.created_at,
            u.display_name, u.email
     FROM project_access pa
     JOIN users u ON u.id = pa.user_id
     WHERE pa.user_id = ? AND pa.project_id = ?`,
    userId, projectId,
  )

  return ok(c, row)
})

projectAccess.delete('/projects/:id/access/:userId', async (c) => {
  const caller = c.get('user')
  const projectId = parseId(c.req.param('id'))
  const userId = parseId(c.req.param('userId'))
  if (!projectId || !userId) return err(c, 'invalid id', 404)

  if (!await canManageUsers(caller.id, projectId, caller.role)) {
    return err(c, 'forbidden', 403)
  }

  if (caller.id === userId) {
    return err(c, 'cannot remove yourself from the project', 403)
  }

  const existing = await db.get(
    'SELECT role FROM project_access WHERE user_id = ? AND project_id = ?',
    userId, projectId,
  )
  if (!existing) return err(c, 'no access entry found', 404)

  if (caller.role !== 'super_admin' && existing.role === 'project_admin') {
    return err(c, 'only super_admin can remove project_admin', 403)
  }

  await db.run('DELETE FROM project_access WHERE user_id = ? AND project_id = ?', userId, projectId)

  return ok(c, { user_id: userId, project_id: projectId })
})

export default projectAccess
