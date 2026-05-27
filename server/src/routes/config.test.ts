import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'

vi.mock('../lib/featureFlags.js', () => ({
  getAllFlags: vi.fn().mockResolvedValue({
    ai: true,
    calendar: false,
    retrospective: true,
    auth_password: true,
    auth_google: false,
    auth_github: false,
    github_integration: false,
    gitlab_integration: false,
    email_notifications: false,
    auto_test_case_generation_ai: false,
    auto_story_generation_ai: false,
    card_attachments: false,
  }),
}))

import config from './config'

function makeApp() {
  const app = new Hono()
  // @ts-ignore
  app.route('/', config)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('config routes', () => {
  describe('GET /config (public endpoint)', () => {
    it('returns 200 with feature flags', async () => {
      const res = await makeApp().request('/config')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toHaveProperty('features')
    })

    it('includes ai flag in response', async () => {
      const res = await makeApp().request('/config')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data.features).toHaveProperty('ai')
    })

    it('includes calendar flag in response', async () => {
      const res = await makeApp().request('/config')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data.features).toHaveProperty('calendar')
    })

    it('includes retrospective flag in response', async () => {
      const res = await makeApp().request('/config')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data.features).toHaveProperty('retrospective')
    })

    it('includes auth flags in response', async () => {
      const res = await makeApp().request('/config')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data.features).toHaveProperty('auth_password')
      expect(json.data.features).toHaveProperty('auth_google')
      expect(json.data.features).toHaveProperty('auth_github')
    })

    it('includes github and gitlab integration flags', async () => {
      const res = await makeApp().request('/config')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data.features).toHaveProperty('github_integration')
      expect(json.data.features).toHaveProperty('gitlab_integration')
    })

    it('includes email_notifications flag', async () => {
      const res = await makeApp().request('/config')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data.features).toHaveProperty('email_notifications')
    })

    it('includes AI generation flags', async () => {
      const res = await makeApp().request('/config')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data.features).toHaveProperty('auto_test_case_generation_ai')
      expect(json.data.features).toHaveProperty('auto_story_generation_ai')
    })

    it('includes card_attachments flag', async () => {
      const res = await makeApp().request('/config')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data.features).toHaveProperty('card_attachments')
    })

    it('returns valid feature flag values (boolean)', async () => {
      const res = await makeApp().request('/config')
      expect(res.status).toBe(200)
      const json = await res.json()
      Object.values(json.data.features).forEach((value: any) => {
        expect(typeof value).toBe('boolean')
      })
    })

    it('does not require authentication (public route)', async () => {
      const app = new Hono()
      // @ts-ignore
      app.route('/', config)
      const res = await app.request('/config')
      expect(res.status).toBe(200)
    })

    it('always returns 200 even if getAllFlags fails gracefully', async () => {
      const res = await makeApp().request('/config')
      expect(res.status).toBe(200)
    })

    it('returns error property as null on success', async () => {
      const res = await makeApp().request('/config')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.error).toBe(null)
    })

    it('wraps features in data object', async () => {
      const res = await makeApp().request('/config')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toBeDefined()
      expect(json.data.features).toBeDefined()
    })
  })

  describe('response envelope', () => {
    it('returns { data, error } format', async () => {
      const res = await makeApp().request('/config')
      const json = await res.json()
      expect(json).toHaveProperty('data')
      expect(json).toHaveProperty('error')
    })

    it('sets error to null on success', async () => {
      const res = await makeApp().request('/config')
      const json = await res.json()
      expect(json.error).toBe(null)
    })

    it('sets data to object with features property', async () => {
      const res = await makeApp().request('/config')
      const json = await res.json()
      expect(typeof json.data).toBe('object')
      expect(json.data.features).toBeDefined()
    })
  })
})
