import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId } from '../lib/response.js'
import { canManageUsers } from '../lib/projectAccess.js'

const projectAccess = new Hono()

// GET /projects/:id/access — list all users with a project-level role
projectAccess.get('/projects/:id/access', (c) => {
  const caller = c.get('user')
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid project id', 404)

  if (!canManageUsers(caller.id, projectId, caller.role)) {
    return err(c, 'forbidden', 403)
  }

  const rows = db.prepare(`
    SELECT pa.id, pa.user_id, pa.project_id, pa.role, pa.granted_by, pa.created_at,
           u.display_name, u.email
    FROM project_access pa
    JOIN users u ON u.id = pa.user_id AND u.deleted_at IS NULL
    WHERE pa.project_id = ?
    ORDER BY pa.created_at DESC
  `).all(projectId)

  return ok(c, rows)
})

// POST /projects/:id/access — grant a user a project-level role
projectAccess.post('/projects/:id/access', async (c) => {
  const caller = c.get('user')
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid project id', 404)

  if (!canManageUsers(caller.id, projectId, caller.role)) {
    return err(c, 'forbidden', 403)
  }

  const body = await c.req.json().catch(() => null)
  const parsed = z.object({
    user_id: z.number().int(),
    role: z.enum(['project_admin', 'contributor', 'reader']),
  }).safeParse(body)
  if (!parsed.success) return err(c, 'invalid request body')

  const { user_id, role } = parsed.data

  // project_admin can only assign contributor or reader
  if (caller.role !== 'super_admin' && role === 'project_admin') {
    return err(c, 'only super_admin can assign project_admin role', 403)
  }

  const existing = db.prepare(
    'SELECT id FROM project_access WHERE user_id = ? AND project_id = ?'
  ).get(user_id, projectId)
  if (existing) return err(c, 'user already has access — use PATCH to update', 409)

  const { lastInsertRowid } = db.prepare(
    'INSERT INTO project_access (user_id, project_id, role, granted_by) VALUES (?, ?, ?, ?)'
  ).run(user_id, projectId, role, caller.id)

  const row = db.prepare(`
    SELECT pa.id, pa.user_id, pa.project_id, pa.role, pa.granted_by, pa.created_at,
           u.display_name, u.email
    FROM project_access pa
    JOIN users u ON u.id = pa.user_id
    WHERE pa.id = ?
  `).get(lastInsertRowid)

  return ok(c, row, 201)
})

// PATCH /projects/:id/access/:userId — update a user's project-level role
projectAccess.patch('/projects/:id/access/:userId', async (c) => {
  const caller = c.get('user')
  const projectId = parseId(c.req.param('id'))
  const userId = parseId(c.req.param('userId'))
  if (!projectId || !userId) return err(c, 'invalid id', 404)

  if (!canManageUsers(caller.id, projectId, caller.role)) {
    return err(c, 'forbidden', 403)
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

  const existing = db.prepare(
    'SELECT id FROM project_access WHERE user_id = ? AND project_id = ?'
  ).get(userId, projectId)
  if (!existing) return err(c, 'no access entry found', 404)

  db.prepare(
    'UPDATE project_access SET role = ? WHERE user_id = ? AND project_id = ?'
  ).run(role, userId, projectId)

  const row = db.prepare(`
    SELECT pa.id, pa.user_id, pa.project_id, pa.role, pa.granted_by, pa.created_at,
           u.display_name, u.email
    FROM project_access pa
    JOIN users u ON u.id = pa.user_id
    WHERE pa.user_id = ? AND pa.project_id = ?
  `).get(userId, projectId)

  return ok(c, row)
})

// DELETE /projects/:id/access/:userId — revoke a user's project-level role
projectAccess.delete('/projects/:id/access/:userId', (c) => {
  const caller = c.get('user')
  const projectId = parseId(c.req.param('id'))
  const userId = parseId(c.req.param('userId'))
  if (!projectId || !userId) return err(c, 'invalid id', 404)

  if (!canManageUsers(caller.id, projectId, caller.role)) {
    return err(c, 'forbidden', 403)
  }

  const existing = db.prepare(
    'SELECT id FROM project_access WHERE user_id = ? AND project_id = ?'
  ).get(userId, projectId)
  if (!existing) return err(c, 'no access entry found', 404)

  db.prepare(
    'DELETE FROM project_access WHERE user_id = ? AND project_id = ?'
  ).run(userId, projectId)

  return ok(c, { user_id: userId, project_id: projectId })
})

export default projectAccess
