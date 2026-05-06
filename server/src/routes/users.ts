import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId } from '../lib/response.js'
import { hashPassword } from '../lib/auth.js'
import { requireSuperAdmin } from '../middleware/requireRole.js'

const users = new Hono()

// Search is accessible to all authenticated users (typeahead for assignee/mention)
users.get('/users/search', (c) => {
  const q = c.req.query('q') ?? ''
  const rows = db.prepare(`
    SELECT id, display_name, email FROM users
    WHERE deleted_at IS NULL AND is_active = 1
      AND (display_name LIKE ? OR email LIKE ?)
    ORDER BY display_name LIMIT 20
  `).all(`%${q}%`, `%${q}%`)
  return ok(c, rows)
})

// All other user management endpoints are super_admin only
users.use('/users', requireSuperAdmin)
users.use('/users/:id', requireSuperAdmin)
users.use('/users/:id/project-access', requireSuperAdmin)

users.get('/users', (c) => {
  const rows = db.prepare(
    'SELECT id, email, display_name, role, is_active, created_at FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC'
  ).all()
  return ok(c, rows)
})

users.post('/users', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = z.object({
    email:        z.string().email(),
    display_name: z.string().min(1),
    password:     z.string().min(8),
    role:         z.enum(['super_admin', 'global_reader']).default('global_reader'),
  }).safeParse(body)
  if (!parsed.success) return err(c, 'invalid request body')

  const { email, display_name, password, role } = parsed.data

  const exists = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(email)
  if (exists) return err(c, 'email already in use', 409)

  const hash = hashPassword(password)
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO users (email, display_name, password_hash, role) VALUES (?, ?, ?, ?)'
  ).run(email, display_name, hash, role)

  const user = db.prepare('SELECT id, email, display_name, role, is_active, created_at FROM users WHERE id = ?').get(lastInsertRowid)
  return ok(c, user, 201)
})

users.patch('/users/:id', async (c) => {
  const caller = c.get('user')
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 404)

  const body = await c.req.json().catch(() => null)
  const parsed = z.object({
    display_name: z.string().min(1).optional(),
    role:         z.enum(['super_admin', 'global_reader']).optional(),
    is_active:    z.boolean().optional(),
    new_password: z.string().min(8).optional(),
  }).safeParse(body)
  if (!parsed.success) return err(c, 'invalid request body')

  const { display_name, role, is_active, new_password } = parsed.data

  // Cannot demote the last super_admin
  if (role === 'global_reader') {
    const superAdminCount = (db.prepare(
      "SELECT COUNT(*) as n FROM users WHERE role = 'super_admin' AND deleted_at IS NULL AND id != ?"
    ).get(id) as { n: number }).n
    if (superAdminCount === 0) return err(c, 'cannot demote the last super admin', 409)
  }

  const updates: string[] = []
  const params: (string | number)[] = []

  if (display_name !== undefined) { updates.push('display_name = ?'); params.push(display_name) }
  if (role !== undefined)         { updates.push('role = ?');         params.push(role) }
  if (is_active !== undefined)    { updates.push('is_active = ?');    params.push(is_active ? 1 : 0) }
  if (new_password !== undefined) { updates.push('password_hash = ?'); params.push(hashPassword(new_password)) }

  if (updates.length === 0) return err(c, 'nothing to update')

  updates.push("updated_at = datetime('now')")
  params.push(id)
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ? AND deleted_at IS NULL`).run(...params)

  const user = db.prepare('SELECT id, email, display_name, role, is_active, created_at FROM users WHERE id = ?').get(id)
  return ok(c, user)
})

// GET /users/:id/project-access — all projects with this user's role (null = no access)
users.get('/users/:id/project-access', (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 404)

  const rows = db.prepare(`
    SELECT p.id AS project_id, p.name AS project_name, pa.role
    FROM projects p
    LEFT JOIN project_access pa ON pa.project_id = p.id AND pa.user_id = ?
    WHERE p.deleted_at IS NULL
    ORDER BY p.name
  `).all(id) as { project_id: number; project_name: string; role: string | null }[]

  return ok(c, rows)
})

users.delete('/users/:id', (c) => {
  const caller = c.get('user')
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 404)
  if (id === caller.id) return err(c, 'cannot delete your own account', 409)

  // Cannot delete last super_admin
  const target = db.prepare('SELECT role FROM users WHERE id = ? AND deleted_at IS NULL').get(id) as { role: string } | undefined
  if (!target) return err(c, 'user not found', 404)
  if (target.role === 'super_admin') {
    const count = (db.prepare("SELECT COUNT(*) as n FROM users WHERE role = 'super_admin' AND deleted_at IS NULL").get() as { n: number }).n
    if (count <= 1) return err(c, 'cannot delete the last super admin', 409)
  }

  db.prepare("UPDATE users SET deleted_at = datetime('now'), is_active = 0 WHERE id = ?").run(id)
  return ok(c, { id })
})

export default users
