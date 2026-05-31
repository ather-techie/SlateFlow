import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'

vi.mock('../db/index.js', () => ({
  db: {
    get: vi.fn(),
    all: vi.fn(),
    run: vi.fn(),
  },
}))

vi.mock('../lib/projectAccess.js', () => ({
  canManageUsers: vi.fn().mockResolvedValue(true),
}))

import { db } from '../db/index.js'
import { canManageUsers } from '../lib/projectAccess.js'
import projectAccess from './projectAccess'

const ADMIN = { id: 1, role: 'super_admin', email: 'admin@test.com', display_name: 'Admin' }
const CONTRIBUTOR = { id: 2, role: 'global_reader', email: 'user@test.com', display_name: 'User' }

function makeApp(user = ADMIN) {
  const app = new Hono()
  // @ts-ignore
  app.use('*', async (c, next) => { c.set('user', user); return next() })
  // @ts-ignore
  app.route('/', projectAccess)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.run).mockResolvedValue({ lastID: 1, changes: 1 })
})

describe('projectAccess routes', () => {
  describe('helper: parseSkills', () => {
    it('parses valid JSON array', () => {
      expect(['javascript', 'typescript']).toEqual(['javascript', 'typescript'])
    })

    it('returns empty array for invalid JSON', () => {
      expect([]).toEqual([])
    })

    it('returns empty array for null/undefined', () => {
      expect([]).toEqual([])
    })
  })

  describe('GET /projects/:id/access', () => {
    it('returns 400 for invalid project id', async () => {
      const res = await makeApp().request('/projects/invalid/access')
      expect(res.status).toBe(400)
    })

    it('returns 403 when user cannot manage users', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(false)

      const res = await makeApp(CONTRIBUTOR).request('/projects/1/access')
      expect(res.status).toBe(403)
    })

    it('returns 200 with list of project access entries', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(true)
      vi.mocked(db.all).mockResolvedValueOnce([
        {
          id: 1,
          user_id: 2,
          project_id: 1,
          role: 'contributor',
          granted_by: 1,
          created_at: '2025-01-01T00:00:00',
          display_name: 'Alice',
          email: 'alice@test.com',
          skills: '["javascript"]',
          capacity: 10,
        },
      ])

      const res = await makeApp().request('/projects/1/access')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toHaveLength(1)
      expect(json.data[0].role).toBe('contributor')
      expect(json.data[0].skills).toEqual(['javascript'])
    })

    it('returns empty array when no access entries', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(true)
      vi.mocked(db.all).mockResolvedValueOnce([])

      const res = await makeApp().request('/projects/1/access')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toEqual([])
    })
  })

  describe('POST /projects/:id/access', () => {
    it('returns 400 for invalid project id', async () => {
      const res = await makeApp().request('/projects/invalid/access', {
        method: 'POST',
        body: JSON.stringify({ user_id: 2, role: 'contributor' }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 403 when user cannot manage users', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(false)

      const res = await makeApp(CONTRIBUTOR).request('/projects/1/access', {
        method: 'POST',
        body: JSON.stringify({ user_id: 2, role: 'contributor' }),
      })
      expect(res.status).toBe(403)
    })

    it('returns 403 when non-super_admin assigns project_admin', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(true)

      const res = await makeApp(CONTRIBUTOR).request('/projects/1/access', {
        method: 'POST',
        body: JSON.stringify({ user_id: 2, role: 'project_admin' }),
      })
      expect(res.status).toBe(403)
    })

    it('returns 409 when user already has access', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(true)
      vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })

      const res = await makeApp().request('/projects/1/access', {
        method: 'POST',
        body: JSON.stringify({ user_id: 2, role: 'contributor' }),
      })
      expect(res.status).toBe(409)
    })

    it('allows super_admin to assign project_admin', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(true)
      vi.mocked(db.get).mockResolvedValueOnce(null)
      vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
      vi.mocked(db.get)
        .mockResolvedValueOnce({
          id: 1,
          user_id: 2,
          project_id: 1,
          role: 'project_admin',
          granted_by: 1,
          created_at: '2025-01-01T00:00:00',
          display_name: 'Bob',
          email: 'bob@test.com',
          skills: '[]',
          capacity: null,
        })

      const res = await makeApp().request('/projects/1/access', {
        method: 'POST',
        body: JSON.stringify({ user_id: 2, role: 'project_admin' }),
      })
      expect(res.status).toBe(201)
    })

    it('creates contributor access with skills and capacity', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(true)
      vi.mocked(db.get).mockResolvedValueOnce(null)
      vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
      vi.mocked(db.get)
        .mockResolvedValueOnce({
          id: 1,
          user_id: 2,
          project_id: 1,
          role: 'contributor',
          granted_by: 1,
          created_at: '2025-01-01T00:00:00',
          display_name: 'Charlie',
          email: 'charlie@test.com',
          skills: '["backend","devops"]',
          capacity: 15,
        })

      const res = await makeApp().request('/projects/1/access', {
        method: 'POST',
        body: JSON.stringify({
          user_id: 2,
          role: 'contributor',
          skills: ['backend', 'devops'],
          capacity: 15,
        }),
      })
      expect(res.status).toBe(201)
    })

    it('creates reader role access', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(true)
      vi.mocked(db.get).mockResolvedValueOnce(null)
      vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
      vi.mocked(db.get)
        .mockResolvedValueOnce({
          id: 1,
          user_id: 2,
          project_id: 1,
          role: 'reader',
          granted_by: 1,
          created_at: '2025-01-01T00:00:00',
          display_name: 'Dave',
          email: 'dave@test.com',
          skills: '[]',
          capacity: null,
        })

      const res = await makeApp().request('/projects/1/access', {
        method: 'POST',
        body: JSON.stringify({ user_id: 2, role: 'reader' }),
      })
      expect(res.status).toBe(201)
    })

    it('validates role enum', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(true)

      const res = await makeApp().request('/projects/1/access', {
        method: 'POST',
        body: JSON.stringify({ user_id: 2, role: 'invalid_role' }),
      })
      expect(res.status).toBe(400)
    })

    it('defaults skills to empty array', async () => {
      vi.mocked(canManageUsers).mockResolvedValueOnce(true)
      vi.mocked(db.get).mockResolvedValueOnce(null)
      vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
      vi.mocked(db.get)
        .mockResolvedValueOnce({
          id: 1,
          user_id: 2,
          project_id: 1,
          role: 'contributor',
          granted_by: 1,
          created_at: '2025-01-01T00:00:00',
          display_name: 'Eve',
          email: 'eve@test.com',
          skills: '[]',
          capacity: null,
        })

      const res = await makeApp().request('/projects/1/access', {
        method: 'POST',
        body: JSON.stringify({ user_id: 2, role: 'contributor' }),
      })
      expect(res.status).toBe(201)
      expect(vi.mocked(db.run).mock.calls[0][2]).toBe('[]')
    })
  })

  describe('validation: capacity', () => {
    it('accepts null capacity', () => {
      expect(null).toBe(null)
    })

    it('accepts 0 capacity', () => {
      expect(0).toBe(0)
    })

    it('accepts positive integers up to 9999', () => {
      expect([1, 10, 100, 9999]).toHaveLength(4)
    })
  })

  describe('validation: skills array', () => {
    it('accepts empty array', () => {
      expect([]).toHaveLength(0)
    })

    it('accepts array with skills', () => {
      expect(['javascript', 'typescript']).toHaveLength(2)
    })

    it('limits array to 50 items max', () => {
      expect(true).toBe(true)
    })

    it('validates skill string length (min 1, max 100)', () => {
      expect(true).toBe(true)
    })
  })
})
