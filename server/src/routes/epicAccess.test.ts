import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'

vi.mock('../db/index.js', () => ({
  db: {
    get: vi.fn(),
    all: vi.fn(),
    run: vi.fn(),
  },
}))

vi.mock('../lib/epicAccess.js', () => ({
  canManageUsers: vi.fn().mockResolvedValue(true),
}))

import { db } from '../db/index.js'
import { canManageUsers } from '../lib/epicAccess.js'
import epicAccess from './epicAccess'

const ADMIN = { id: 1, role: 'super_admin', email: 'admin@test.com', display_name: 'Admin' }
const USER = { id: 2, role: 'global_reader', email: 'user@test.com', display_name: 'User' }

function makeApp(user = ADMIN) {
  const app = new Hono()
  // @ts-ignore
  app.use('*', async (c, next) => { c.set('user', user); return next() })
  // @ts-ignore
  app.route('/', epicAccess)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.run).mockResolvedValue({ lastID: 1, changes: 1 })
})

describe('epicAccess routes', () => {
  describe('GET /epics/:id/access', () => {
    it('returns 400 for invalid epic id', async () => {
      const res = await makeApp().request('/epics/invalid/access')
      expect(res.status).toBe(400)
    })

    it('returns 403 when user cannot manage users', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(false)

      const res = await makeApp(USER).request('/epics/1/access')
      expect(res.status).toBe(403)
    })

    it('returns 200 with list of epic access entries', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(true)
      vi.mocked(db.all).mockResolvedValueOnce([
        {
          id: 1,
          user_id: 2,
          epic_id: 1,
          role: 'contributor',
          granted_by: 1,
          created_at: '2025-01-01T00:00:00',
          display_name: 'Alice',
          email: 'alice@test.com',
        },
      ])

      const res = await makeApp().request('/epics/1/access')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toHaveLength(1)
      expect(json.data[0].role).toBe('contributor')
    })

    it('returns empty array when no access entries', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(true)
      vi.mocked(db.all).mockResolvedValueOnce([])

      const res = await makeApp().request('/epics/1/access')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toEqual([])
    })
  })

  describe('POST /epics/:id/access', () => {
    it('returns 400 for invalid epic id', async () => {
      const res = await makeApp().request('/epics/invalid/access', {
        method: 'POST',
        body: JSON.stringify({ user_id: 2, role: 'contributor' }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 403 when user cannot manage users', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(false)

      const res = await makeApp(USER).request('/epics/1/access', {
        method: 'POST',
        body: JSON.stringify({ user_id: 2, role: 'contributor' }),
      })
      expect(res.status).toBe(403)
    })

    it('returns 403 when non-super_admin assigns epic_admin', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(true)

      const res = await makeApp(USER).request('/epics/1/access', {
        method: 'POST',
        body: JSON.stringify({ user_id: 2, role: 'epic_admin' }),
      })
      expect(res.status).toBe(403)
    })

    it('returns 404 when target user not found', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(true)
      vi.mocked(db.get).mockResolvedValueOnce(null)

      const res = await makeApp().request('/epics/1/access', {
        method: 'POST',
        body: JSON.stringify({ user_id: 999, role: 'contributor' }),
      })
      expect(res.status).toBe(404)
    })

    it('returns 409 when user already has access', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(true)
      vi.mocked(db.get).mockResolvedValueOnce({ id: 2 })
      vi.mocked(db.run).mockRejectedValueOnce(new Error('UNIQUE constraint failed'))

      const res = await makeApp().request('/epics/1/access', {
        method: 'POST',
        body: JSON.stringify({ user_id: 2, role: 'contributor' }),
      })
      expect(res.status).toBe(409)
    })

    it('allows super_admin to assign epic_admin', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(true)
      vi.mocked(db.get).mockResolvedValueOnce({ id: 2 })
      vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
      vi.mocked(db.get)
        .mockResolvedValueOnce({
          id: 1,
          user_id: 2,
          epic_id: 1,
          role: 'epic_admin',
          granted_by: 1,
          created_at: '2025-01-01T00:00:00',
          display_name: 'Bob',
          email: 'bob@test.com',
        })

      const res = await makeApp().request('/epics/1/access', {
        method: 'POST',
        body: JSON.stringify({ user_id: 2, role: 'epic_admin' }),
      })
      expect(res.status).toBe(201)
    })

    it('creates contributor access', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(true)
      vi.mocked(db.get).mockResolvedValueOnce({ id: 2 })
      vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
      vi.mocked(db.get)
        .mockResolvedValueOnce({
          id: 1,
          user_id: 2,
          epic_id: 1,
          role: 'contributor',
          granted_by: 1,
          created_at: '2025-01-01T00:00:00',
          display_name: 'Charlie',
          email: 'charlie@test.com',
        })

      const res = await makeApp().request('/epics/1/access', {
        method: 'POST',
        body: JSON.stringify({ user_id: 2, role: 'contributor' }),
      })
      expect(res.status).toBe(201)
    })

    it('creates reader access', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(true)
      vi.mocked(db.get).mockResolvedValueOnce({ id: 2 })
      vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
      vi.mocked(db.get)
        .mockResolvedValueOnce({
          id: 1,
          user_id: 2,
          epic_id: 1,
          role: 'reader',
          granted_by: 1,
          created_at: '2025-01-01T00:00:00',
          display_name: 'Dave',
          email: 'dave@test.com',
        })

      const res = await makeApp().request('/epics/1/access', {
        method: 'POST',
        body: JSON.stringify({ user_id: 2, role: 'reader' }),
      })
      expect(res.status).toBe(201)
    })

    it('validates role enum', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(true)

      const res = await makeApp().request('/epics/1/access', {
        method: 'POST',
        body: JSON.stringify({ user_id: 2, role: 'invalid_role' }),
      })
      expect(res.status).toBe(400)
    })

    it('requires positive user_id', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(true)

      const res = await makeApp().request('/epics/1/access', {
        method: 'POST',
        body: JSON.stringify({ user_id: 0, role: 'contributor' }),
      })
      expect(res.status).toBe(400)
    })
  })

  describe('PATCH /epics/:epicId/access/:userId', () => {
    it('returns 400 for invalid epic id', async () => {
      const res = await makeApp().request('/epics/invalid/access/1', {
        method: 'PATCH',
        body: JSON.stringify({ role: 'contributor' }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid user id', async () => {
      const res = await makeApp().request('/epics/1/access/invalid', {
        method: 'PATCH',
        body: JSON.stringify({ role: 'contributor' }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 403 when user cannot manage users', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(false)

      const res = await makeApp(USER).request('/epics/1/access/2', {
        method: 'PATCH',
        body: JSON.stringify({ role: 'contributor' }),
      })
      expect(res.status).toBe(403)
    })

    it('returns 403 when non-super_admin upgrades to epic_admin', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(true)

      const res = await makeApp(USER).request('/epics/1/access/2', {
        method: 'PATCH',
        body: JSON.stringify({ role: 'epic_admin' }),
      })
      expect(res.status).toBe(403)
    })

    it('updates role to contributor', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(true)
      vi.mocked(db.get)
        .mockResolvedValueOnce({
          id: 1,
          user_id: 2,
          epic_id: 1,
          role: 'contributor',
          granted_by: 1,
          created_at: '2025-01-01T00:00:00',
          display_name: 'Alice',
          email: 'alice@test.com',
        })

      const res = await makeApp().request('/epics/1/access/2', {
        method: 'PATCH',
        body: JSON.stringify({ role: 'contributor' }),
      })
      expect(res.status).toBe(200)
    })

    it('downgrades role to reader', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(true)
      vi.mocked(db.get)
        .mockResolvedValueOnce({
          id: 1,
          user_id: 2,
          epic_id: 1,
          role: 'reader',
          granted_by: 1,
          created_at: '2025-01-01T00:00:00',
          display_name: 'Bob',
          email: 'bob@test.com',
        })

      const res = await makeApp().request('/epics/1/access/2', {
        method: 'PATCH',
        body: JSON.stringify({ role: 'reader' }),
      })
      expect(res.status).toBe(200)
    })

    it('super_admin can upgrade to epic_admin', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(true)
      vi.mocked(db.get)
        .mockResolvedValueOnce({
          id: 1,
          user_id: 2,
          epic_id: 1,
          role: 'epic_admin',
          granted_by: 1,
          created_at: '2025-01-01T00:00:00',
          display_name: 'Charlie',
          email: 'charlie@test.com',
        })

      const res = await makeApp().request('/epics/1/access/2', {
        method: 'PATCH',
        body: JSON.stringify({ role: 'epic_admin' }),
      })
      expect(res.status).toBe(200)
    })
  })

  describe('DELETE /epics/:epicId/access/:userId', () => {
    it('returns 400 for invalid epic id', async () => {
      const res = await makeApp().request('/epics/invalid/access/1', {
        method: 'DELETE',
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid user id', async () => {
      const res = await makeApp().request('/epics/1/access/invalid', {
        method: 'DELETE',
      })
      expect(res.status).toBe(400)
    })

    it('returns 403 when user cannot manage users', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(false)

      const res = await makeApp(USER).request('/epics/1/access/2', {
        method: 'DELETE',
      })
      expect(res.status).toBe(403)
    })

    it('revokes access successfully', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(true)
      vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
      vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })

      const res = await makeApp().request('/epics/1/access/2', {
        method: 'DELETE',
      })
      expect(res.status).toBe(200)
    })
  })

  describe('validation: role enum', () => {
    it('accepts epic_admin, contributor, reader', () => {
      const roles = ['epic_admin', 'contributor', 'reader']
      expect(roles).toContain('epic_admin')
      expect(roles).toContain('contributor')
      expect(roles).toContain('reader')
    })
  })
})
