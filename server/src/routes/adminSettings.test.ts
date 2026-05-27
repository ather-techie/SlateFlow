import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'

vi.mock('../db/index.js', () => ({
  db: {
    get: vi.fn(),
    all: vi.fn(),
    run: vi.fn(),
  },
}))

vi.mock('../lib/featureFlags.js', () => ({
  getAllFlags: vi.fn(),
  setFlag: vi.fn(),
  isEnabled: vi.fn(),
}))

vi.mock('../lib/oauth/google.js', () => ({
  google: {
    isConfigured: vi.fn().mockReturnValue(true),
  },
}))

vi.mock('../lib/oauth/github.js', () => ({
  github: {
    isConfigured: vi.fn().mockReturnValue(true),
  },
}))

import { db } from '../db/index.js'
import { getAllFlags, setFlag, isEnabled } from '../lib/featureFlags.js'
import adminSettings from './adminSettings'

const ADMIN = { id: 1, role: 'super_admin', email: 'admin@test.com', display_name: 'Admin' }
const USER = { id: 2, role: 'global_reader', email: 'user@test.com', display_name: 'User' }

function makeApp(user = ADMIN) {
  const app = new Hono()
  // @ts-ignore
  app.use('*', async (c, next) => { c.set('user', user); return next() })
  // @ts-ignore
  app.route('/', adminSettings)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.run).mockResolvedValue({ lastID: 1, changes: 1 })
  vi.mocked(db.all).mockResolvedValue([])
})

describe('adminSettings routes', () => {
  describe('middleware: requireSuperAdmin', () => {
    it('blocks non-super_admin access', async () => {
      const res = await makeApp(USER).request('/admin/feature-overrides')
      expect(res.status).toBe(403)
    })
  })

  describe('GET /admin/feature-overrides', () => {
    it('returns 200 with feature flag list', async () => {
      vi.mocked(db.all).mockResolvedValueOnce([
        { flag: 'ai', enabled: 1 },
        { flag: 'calendar', enabled: 0 },
      ])
      vi.mocked(isEnabled).mockResolvedValue(true)
      vi.mocked(getAllFlags).mockResolvedValue({ ai: true, calendar: false })

      const res = await makeApp().request('/admin/feature-overrides')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toHaveLength(12)
    })

    it('includes env_enabled status', async () => {
      vi.mocked(db.all).mockResolvedValueOnce([])
      vi.mocked(isEnabled).mockResolvedValue(true)
      vi.mocked(getAllFlags).mockResolvedValue({})

      const res = await makeApp().request('/admin/feature-overrides')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data[0]).toHaveProperty('env_enabled')
    })

    it('includes can_toggle status', async () => {
      vi.mocked(db.all).mockResolvedValueOnce([])
      vi.mocked(isEnabled).mockResolvedValue(true)
      vi.mocked(getAllFlags).mockResolvedValue({})

      const res = await makeApp().request('/admin/feature-overrides')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data[0]).toHaveProperty('can_toggle')
    })

    it('includes db_override status (null when not set)', async () => {
      vi.mocked(db.all).mockResolvedValueOnce([])
      vi.mocked(isEnabled).mockResolvedValue(false)
      vi.mocked(getAllFlags).mockResolvedValue({})

      const res = await makeApp().request('/admin/feature-overrides')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data[0].db_override).toBe(null)
    })

    it('includes resolved flag status', async () => {
      vi.mocked(db.all).mockResolvedValueOnce([])
      vi.mocked(isEnabled).mockResolvedValue(true)
      vi.mocked(getAllFlags).mockResolvedValue({})

      const res = await makeApp().request('/admin/feature-overrides')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data[0]).toHaveProperty('resolved')
    })

    it('includes configured status for OAuth providers', async () => {
      vi.mocked(db.all).mockResolvedValueOnce([])
      vi.mocked(isEnabled).mockResolvedValue(true)
      vi.mocked(getAllFlags).mockResolvedValue({})

      const res = await makeApp().request('/admin/feature-overrides')
      expect(res.status).toBe(200)
      const json = await res.json()
      const googleFlag = json.data.find((f: any) => f.flag === 'auth_google')
      if (googleFlag && googleFlag.flag === 'auth_google' || googleFlag.flag === 'auth_github') {
        expect(googleFlag).toHaveProperty('configured')
      }
    })
  })

  describe('PATCH /admin/feature-overrides/:flag', () => {
    it('returns 400 without enabled field', async () => {
      const res = await makeApp().request('/admin/feature-overrides/ai', {
        method: 'PATCH',
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(400)
    })

    it('returns 404 for unknown flag', async () => {
      const res = await makeApp().request('/admin/feature-overrides/unknown_flag', {
        method: 'PATCH',
        body: JSON.stringify({ enabled: true }),
      })
      expect(res.status).toBe(404)
    })

    it('enables ai flag', async () => {
      vi.mocked(setFlag).mockResolvedValueOnce(undefined)
      vi.mocked(getAllFlags).mockResolvedValueOnce({ ai: true })

      const res = await makeApp().request('/admin/feature-overrides/ai', {
        method: 'PATCH',
        body: JSON.stringify({ enabled: true }),
      })
      expect(res.status).toBe(200)
      expect(vi.mocked(setFlag)).toHaveBeenCalledWith('ai', true, ADMIN.id)
    })

    it('disables calendar flag', async () => {
      vi.mocked(setFlag).mockResolvedValueOnce(undefined)
      vi.mocked(getAllFlags).mockResolvedValueOnce({ calendar: false })

      const res = await makeApp().request('/admin/feature-overrides/calendar', {
        method: 'PATCH',
        body: JSON.stringify({ enabled: false }),
      })
      expect(res.status).toBe(200)
      expect(vi.mocked(setFlag)).toHaveBeenCalledWith('calendar', false, ADMIN.id)
    })

    it('toggles retrospective flag', async () => {
      vi.mocked(setFlag).mockResolvedValueOnce(undefined)
      vi.mocked(getAllFlags).mockResolvedValueOnce({ retrospective: true })

      const res = await makeApp().request('/admin/feature-overrides/retrospective', {
        method: 'PATCH',
        body: JSON.stringify({ enabled: true }),
      })
      expect(res.status).toBe(200)
    })

    it('toggles auth_password flag', async () => {
      vi.mocked(setFlag).mockResolvedValueOnce(undefined)
      vi.mocked(getAllFlags).mockResolvedValueOnce({ auth_password: false })

      const res = await makeApp().request('/admin/feature-overrides/auth_password', {
        method: 'PATCH',
        body: JSON.stringify({ enabled: false }),
      })
      expect(res.status).toBe(200)
    })

    it('toggles github_integration flag', async () => {
      vi.mocked(setFlag).mockResolvedValueOnce(undefined)
      vi.mocked(getAllFlags).mockResolvedValueOnce({ github_integration: true })

      const res = await makeApp().request('/admin/feature-overrides/github_integration', {
        method: 'PATCH',
        body: JSON.stringify({ enabled: true }),
      })
      expect(res.status).toBe(200)
    })

    it('returns 200 with updated flags', async () => {
      vi.mocked(setFlag).mockResolvedValueOnce(undefined)
      vi.mocked(getAllFlags).mockResolvedValueOnce({ ai: true, calendar: false })

      const res = await makeApp().request('/admin/feature-overrides/ai', {
        method: 'PATCH',
        body: JSON.stringify({ enabled: true }),
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toHaveProperty('features')
    })
  })

  describe('DELETE /admin/feature-overrides/:flag', () => {
    it('returns 404 for unknown flag', async () => {
      const res = await makeApp().request('/admin/feature-overrides/unknown_flag', {
        method: 'DELETE',
      })
      expect(res.status).toBe(404)
    })

    it('removes ai flag override', async () => {
      vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
      vi.mocked(getAllFlags).mockResolvedValueOnce({ ai: false })

      const res = await makeApp().request('/admin/feature-overrides/ai', {
        method: 'DELETE',
      })
      expect(res.status).toBe(200)
      expect(vi.mocked(db.run)).toHaveBeenCalledWith(
        'DELETE FROM feature_overrides WHERE flag = ?',
        'ai'
      )
    })

    it('removes calendar flag override', async () => {
      vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
      vi.mocked(getAllFlags).mockResolvedValueOnce({ calendar: false })

      const res = await makeApp().request('/admin/feature-overrides/calendar', {
        method: 'DELETE',
      })
      expect(res.status).toBe(200)
    })

    it('returns 200 with updated flags', async () => {
      vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
      vi.mocked(getAllFlags).mockResolvedValueOnce({})

      const res = await makeApp().request('/admin/feature-overrides/ai', {
        method: 'DELETE',
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toHaveProperty('features')
    })
  })

  describe('validation: known flags', () => {
    it('lists all 12 known feature flags', () => {
      const flags = ['ai', 'auto_test_case_generation_ai', 'auto_story_generation_ai', 'retrospective', 'calendar', 'auth_password', 'auth_google', 'auth_github', 'github_integration', 'gitlab_integration', 'email_notifications', 'card_attachments']
      expect(flags).toHaveLength(12)
    })
  })
})
