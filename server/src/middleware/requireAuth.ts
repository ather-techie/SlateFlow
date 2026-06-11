import type { MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import { verifyToken } from '../lib/auth.js'
import { db } from '../db/index.js'
import { err } from '../lib/response.js'

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const token = getCookie(c, 'sf_token')
  if (!token) return err(c, 'authentication required', 401)

  const payload = await verifyToken(token)
  if (!payload) return err(c, 'invalid or expired token', 401)

  const user = await db.get<{
    id: number
    email: string
    display_name: string
    role: 'super_admin' | 'global_reader'
    is_active: number
  }>(
    'SELECT id, email, display_name, role, is_active FROM users WHERE id = ? AND deleted_at IS NULL AND is_active = 1',
    payload.sub,
  )

  if (!user) return err(c, 'user not found or deactivated', 401)

  c.set('user', user)
  await next()
}
