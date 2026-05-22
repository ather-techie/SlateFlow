import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId } from '../lib/response.js'
import { canManageUsers } from '../lib/projectAccess.js'

const projectAccess = new Hono()

function parseSkills(s: string | null | undefined): string[] {
  try { return JSON.parse(s ?? '[]') } catch { return [] }
}

projectAccess.get('/projects/:id/access', async (c) => {
  const caller = c.get('user')
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid project id', 404)

  if (!await canManageUsers(caller.id, projectId, caller.role)) {
    return err(c, 'forbidden', 403)
  }

  const rows = await db.all<{
    id: number; user_id: number; project_id: number; role: string; granted_by: number | null; created_at: string;
    display_name: string; email: string; skills: string; capacity: number | null;
  }>(
    `SELECT pa.id, pa.user_id, pa.project_id, pa.role, pa.granted_by, pa.created_at,
            pa.skills, pa.capacity,
            u.display_name, u.email
     FROM project_access pa
     JOIN users u ON u.id = pa.user_id AND u.deleted_at IS NULL
     WHERE pa.project_id = ?
     ORDER BY pa.created_at DESC`,
    projectId,
  )

  return ok(c, rows.map(r => ({ ...r, skills: parseSkills(r.skills) })))
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
    skills: z.array(z.string().min(1).max(100)).max(50).default([]),
    capacity: z.number().int().min(0).max(9999).nullable().optional(),
  }).safeParse(body)
  if (!parsed.success) return err(c, 'invalid request body')

  const { user_id, role, skills, capacity } = parsed.data

  if (caller.role !== 'super_admin' && role === 'project_admin') {
    return err(c, 'only super_admin can assign project_admin role', 403)
  }

  const existing = await db.get(
    'SELECT id FROM project_access WHERE user_id = ? AND project_id = ?',
    user_id, projectId,
  )
  if (existing) return err(c, 'user already has access — use PATCH to update', 409)

  const { lastID } = await db.run(
    'INSERT INTO project_access (user_id, project_id, role, granted_by, skills, capacity) VALUES (?, ?, ?, ?, ?, ?)',
    user_id, projectId, role, caller.id, JSON.stringify(skills), capacity ?? null,
  )

  const row = await db.get<{
    id: number; user_id: number; project_id: number; role: string; granted_by: number | null; created_at: string;
    display_name: string; email: string; skills: string; capacity: number | null;
  }>(
    `SELECT pa.id, pa.user_id, pa.project_id, pa.role, pa.granted_by, pa.created_at,
            pa.skills, pa.capacity,
            u.display_name, u.email
     FROM project_access pa
     JOIN users u ON u.id = pa.user_id
     WHERE pa.id = ?`,
    lastID,
  )

  return ok(c, { ...row, skills: parseSkills(row?.skills) }, 201)
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
    role: z.enum(['project_admin', 'contributor', 'reader']).optional(),
    skills: z.array(z.string().min(1).max(100)).max(50).optional(),
    capacity: z.number().int().min(0).max(9999).nullable().optional(),
  }).safeParse(body)
  if (!parsed.success) return err(c, 'invalid request body')

  const { role, skills, capacity } = parsed.data

  if (role === 'project_admin' && caller.role !== 'super_admin') {
    return err(c, 'only super_admin can assign project_admin role', 403)
  }

  const existing = await db.get(
    'SELECT id FROM project_access WHERE user_id = ? AND project_id = ?',
    userId, projectId,
  )
  if (!existing) return err(c, 'no access entry found', 404)

  const updates: string[] = []
  const params: (string | number | null)[] = []

  if (role !== undefined)     { updates.push('role = ?');     params.push(role) }
  if (skills !== undefined)   { updates.push('skills = ?');   params.push(JSON.stringify(skills)) }
  if (capacity !== undefined) { updates.push('capacity = ?'); params.push(capacity) }

  if (updates.length === 0) return err(c, 'nothing to update')

  params.push(userId, projectId)
  await db.run(
    `UPDATE project_access SET ${updates.join(', ')} WHERE user_id = ? AND project_id = ?`,
    ...params,
  )

  const row = await db.get<{
    id: number; user_id: number; project_id: number; role: string; granted_by: number | null; created_at: string;
    display_name: string; email: string; skills: string; capacity: number | null;
  }>(
    `SELECT pa.id, pa.user_id, pa.project_id, pa.role, pa.granted_by, pa.created_at,
            pa.skills, pa.capacity,
            u.display_name, u.email
     FROM project_access pa
     JOIN users u ON u.id = pa.user_id
     WHERE pa.user_id = ? AND pa.project_id = ?`,
    userId, projectId,
  )

  return ok(c, { ...row, skills: parseSkills(row?.skills) })
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
