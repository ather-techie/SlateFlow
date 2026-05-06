import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err } from '../lib/response.js'
import { signToken, verifyToken, hashPassword, verifyPassword } from '../lib/auth.js'
import { requireAuth } from '../middleware/requireAuth.js'

const auth = new Hono()

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'Lax' as const,
  path: '/',
  maxAge: 7 * 24 * 3600,
  secure: process.env.NODE_ENV === 'production',
}

auth.post('/auth/login', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(body)
  if (!parsed.success) return err(c, 'email and password are required')

  const user = db.prepare(
    'SELECT id, email, display_name, role, password_hash, is_active, deleted_at FROM users WHERE email = ? COLLATE NOCASE'
  ).get(parsed.data.email) as {
    id: number; email: string; display_name: string; role: string
    password_hash: string; is_active: number; deleted_at: string | null
  } | undefined

  if (!user || user.deleted_at || !user.is_active) return err(c, 'invalid credentials', 401)
  if (!verifyPassword(parsed.data.password, user.password_hash)) return err(c, 'invalid credentials', 401)

  const token = await signToken({ sub: user.id, email: user.email, role: user.role })
  setCookie(c, 'sf_token', token, COOKIE_OPTS)

  return ok(c, { id: user.id, email: user.email, display_name: user.display_name, role: user.role })
})

auth.post('/auth/logout', (c) => {
  deleteCookie(c, 'sf_token', { path: '/' })
  return ok(c, { ok: true })
})

auth.get('/auth/me', requireAuth, (c) => {
  const user = c.get('user')
  const projectAccess = db.prepare(
    'SELECT project_id, role FROM project_access WHERE user_id = ?'
  ).all(user.id) as { project_id: number; role: string }[]

  return ok(c, {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    role: user.role,
    project_access: projectAccess,
  })
})

auth.patch('/auth/me', requireAuth, async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  const parsed = z.object({
    display_name: z.string().min(1).optional(),
    current_password: z.string().optional(),
    new_password: z.string().min(8).optional(),
  }).safeParse(body)
  if (!parsed.success) return err(c, 'invalid request body')

  const { display_name, current_password, new_password } = parsed.data

  if (new_password) {
    if (!current_password) return err(c, 'current_password is required to set a new password')
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as { password_hash: string }
    if (!verifyPassword(current_password, row.password_hash)) return err(c, 'current password is incorrect', 401)
  }

  const updates: string[] = []
  const params: (string | number)[] = []

  if (display_name) { updates.push('display_name = ?'); params.push(display_name) }
  if (new_password)  { updates.push('password_hash = ?'); params.push(hashPassword(new_password)) }

  if (updates.length === 0) return err(c, 'nothing to update')

  updates.push("updated_at = datetime('now')")
  params.push(user.id)
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params)

  const updated = db.prepare('SELECT id, email, display_name, role FROM users WHERE id = ?').get(user.id)
  return ok(c, updated)
})

export default auth
