import { Hono } from 'hono'
import { z } from 'zod'
import { ok, err } from '../lib/response.js'
import { requireSuperAdmin } from '../middleware/requireRole.js'
import { getAllFlags, setFlag, isEnabled, type FeatureFlag } from '../lib/featureFlags.js'

const adminSettings = new Hono()

adminSettings.use('/admin/*', requireSuperAdmin)

adminSettings.get('/admin/feature-overrides', async (c) => {
  const { db } = await import('../db/index.js')
  const rows = await db.all<{ flag: string; enabled: number }>(
    'SELECT flag, enabled FROM feature_overrides'
  )
  const overrideMap = new Map(rows.map((r) => [r.flag, r.enabled]))

  const flags: FeatureFlag[] = ['ai', 'retrospective', 'calendar', 'auth_password', 'auth_google', 'auth_github']
  const result = await Promise.all(flags.map(async (flag) => {
    const envKey = `FEATURE_${flag.toUpperCase()}`
    const envEnabled = process.env[envKey] === 'true'
    const dbRow = overrideMap.get(flag)
    const resolved = await isEnabled(flag)
    return {
      flag,
      env_enabled: envEnabled,
      can_toggle: process.env[envKey] !== 'false',
      db_override: dbRow !== undefined ? dbRow === 1 : null,
      resolved,
    }
  }))

  return ok(c, result)
})

const PatchBody = z.object({ enabled: z.boolean() })

adminSettings.patch('/admin/feature-overrides/:flag', async (c) => {
  const flag = c.req.param('flag') as FeatureFlag
  const knownFlags: FeatureFlag[] = ['ai', 'retrospective', 'calendar', 'auth_password', 'auth_google', 'auth_github']
  if (!knownFlags.includes(flag)) return err(c, 'unknown feature flag', 404)

  const body = await c.req.json().catch(() => null)
  const parsed = PatchBody.safeParse(body)
  if (!parsed.success) return err(c, 'enabled (boolean) is required', 400)

  const user = c.get('user')
  await setFlag(flag, parsed.data.enabled, user.id)

  const features = await getAllFlags()
  return ok(c, { features })
})

adminSettings.delete('/admin/feature-overrides/:flag', async (c) => {
  const flag = c.req.param('flag') as FeatureFlag
  const knownFlags: FeatureFlag[] = ['ai', 'retrospective', 'calendar', 'auth_password', 'auth_google', 'auth_github']
  if (!knownFlags.includes(flag)) return err(c, 'unknown feature flag', 404)

  const { db } = await import('../db/index.js')
  await db.run('DELETE FROM feature_overrides WHERE flag = ?', flag)

  const features = await getAllFlags()
  return ok(c, { features })
})

export default adminSettings
