import type { MiddlewareHandler } from 'hono'
import { err } from '../lib/response.js'

export const requireSuperAdmin: MiddlewareHandler = async (c, next) => {
  const user = c.get('user')
  if (!user || user.role !== 'super_admin') return err(c, 'forbidden', 403)
  await next()
}
