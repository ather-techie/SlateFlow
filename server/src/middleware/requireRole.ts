import type { MiddlewareHandler } from 'hono'
import { err } from '../lib/response.js'
import { isEnabled, type FeatureFlag } from '../lib/featureFlags.js'

export const requireSuperAdmin: MiddlewareHandler = async (c, next) => {
  const user = c.get('user')
  if (!user || user.role !== 'super_admin') return err(c, 'forbidden', 403)
  await next()
}

export const requireFeature = (flag: FeatureFlag): MiddlewareHandler => async (c, next) => {
  if (!(await isEnabled(flag))) return c.json({ data: null, error: 'not found' }, 404)
  await next()
}
