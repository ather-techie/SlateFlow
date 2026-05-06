import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId } from '../lib/response.js'
import { hashPassword } from '../lib/auth.js'
import { requireSuperAdmin } from '../middleware/requireRole.js'

const users = new Hono()

users.get('/users/search', async (c) => {
  const q = c.req.query('q') ?? ''
  const rows = await db.all(
    `SELECT id, display_name, email FROM users
     WHERE deleted_at IS NULL AND is_active = 1
       AND (display_name LIKE ? OR email LIKE ?)
     ORDER BY display_name LIMIT 20`,
    `%${q}%`, `%${q}%`,
  )
  return ok(c, rows)
})

users.use('/users', requireSuperAdmin)
users.use('/users/:id', requireSuperAdmin)
users.use('/users/:id/project-access', requireSuperAdmin)

users.get('/users', async (c) => {
  const rows = await db.all(
    'SELECT id, email, display_name, role, is_active, created_at FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC',
  )
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

  const exists = await db.get('SELECT id FROM users WHERE email = ? COLLATE NOCASE', email)
  if (exists) return err(c, 'email already in use', 409)

  const hash = hashPassword(password)
  const { lastID } = await db.run(
    'INSERT INTO users (email, display_name, password_hash, role) VALUES (?, ?, ?, ?)',
    email, display_name, hash, role,
  )

  const user = await db.get('SELECT id, email, display_name, role, is_active, created_at FROM users WHERE id = ?', lastID)
  return ok(c, user, 201)
})

users.patch('/users/:id', async (c) => {
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

  if (role === 'global_reader') {
    const row = await db.get<{ n: number }>(
      "SELECT COUNT(*) as n FROM users WHERE role = 'super_admin' AND deleted_at IS NULL AND id != ?",
      id,
    )
    if ((row?.n ?? 0) === 0) return err(c, 'cannot demote the last super admin', 409)
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
  await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ? AND deleted_at IS NULL`, ...params)

  const user = await db.get('SELECT id, email, display_name, role, is_active, created_at FROM users WHERE id = ?', id)
  return ok(c, user)
})

users.get('/users/:id/project-access', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 404)

  const rows = await db.all<{ project_id: number; project_name: string; role: string | null }>(
    `SELECT p.id AS project_id, p.name AS project_name, pa.role
     FROM projects p
     LEFT JOIN project_access pa ON pa.project_id = p.id AND pa.user_id = ?
     ORDER BY p.name`,
    id,
  )

  return ok(c, rows)
})

users.delete('/users/:id', async (c) => {
  const caller = c.get('user')
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 404)
  if (id === caller.id) return err(c, 'cannot delete your own account', 409)

  const target = await db.get<{ role: string }>('SELECT role FROM users WHERE id = ? AND deleted_at IS NULL', id)
  if (!target) return err(c, 'user not found', 404)
  if (target.role === 'super_admin') {
    const row = await db.get<{ n: number }>("SELECT COUNT(*) as n FROM users WHERE role = 'super_admin' AND deleted_at IS NULL")
    if ((row?.n ?? 0) <= 1) return err(c, 'cannot delete the last super admin', 409)
  }

  await db.run("UPDATE users SET deleted_at = datetime('now'), is_active = 0 WHERE id = ?", id)
  return ok(c, { id })
})

export default users
