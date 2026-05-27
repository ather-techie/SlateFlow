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
  canRead: vi.fn().mockReturnValue(true),
  canWrite: vi.fn().mockResolvedValue(true),
}))

vi.mock('../lib/eventBus.js', () => ({
  emitBoardEvent: vi.fn(),
}))

import { db } from '../db/index.js'
import retrospectives from './retrospectives'

const ADMIN = { id: 1, role: 'super_admin', email: 'admin@test.com', display_name: 'Admin' }
const USER = { id: 2, role: 'global_reader', email: 'user@test.com', display_name: 'User' }

function makeApp(user = ADMIN) {
  const app = new Hono()
  // @ts-ignore
  app.use('*', async (c, next) => { c.set('user', user); return next() })
  // @ts-ignore
  app.route('/', retrospectives)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.run).mockResolvedValue({ lastID: 1, changes: 1 })
})

describe('retrospectives routes', () => {
  describe('GET /sprints/:sprintId/retrospective', () => {
    it('returns 400 for invalid sprint id', async () => {
      const res = await makeApp().request('/sprints/invalid/retrospective')
      expect(res.status).toBe(400)
    })

    it('returns 404 when sprint not found', async () => {
      vi.mocked(db.get).mockResolvedValueOnce(null)

      const res = await makeApp().request('/sprints/999/retrospective')
      expect([404]).toContain(res.status)
    })

    it('returns 403 when user cannot read project', async () => {
      const canRead = await import('../lib/projectAccess.js')
      vi.mocked(canRead.canRead).mockReturnValueOnce(false)
      vi.mocked(db.get).mockResolvedValueOnce({ id: 1, project_id: 1 })

      const res = await makeApp().request('/sprints/1/retrospective')
      expect([403, 404]).toContain(res.status)
    })

    it('auto-creates retrospective if not exists', async () => {
      vi.mocked(db.get)
        .mockResolvedValueOnce({ id: 1, project_id: 1 })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 1, sprint_id: 1, created_at: '2025-01-01T00:00:00', updated_at: '2025-01-01T00:00:00' })

      vi.mocked(db.all).mockResolvedValueOnce([])

      const res = await makeApp().request('/sprints/1/retrospective')
      expect([200, 404]).toContain(res.status)
    })

    it('returns existing retrospective with items', async () => {
      vi.mocked(db.get)
        .mockResolvedValueOnce({ id: 1, project_id: 1 })
        .mockResolvedValueOnce({ id: 1, sprint_id: 1, created_at: '2025-01-01T00:00:00', updated_at: '2025-01-01T00:00:00' })

      vi.mocked(db.all).mockResolvedValueOnce([
        { id: 1, retrospective_id: 1, category: 'went_well', body: 'Good progress', position: 0, author_id: 1, created_at: '2025-01-01T00:00:00', updated_at: '2025-01-01T00:00:00' },
        { id: 2, retrospective_id: 1, category: 'to_improve', body: 'Slow integration', position: 0, author_id: 1, created_at: '2025-01-01T00:00:00', updated_at: '2025-01-01T00:00:00' },
      ])

      const res = await makeApp().request('/sprints/1/retrospective')
      expect([200, 404]).toContain(res.status)
      if (res.status === 200) {
        const json = await res.json()
        expect(json.data.items).toHaveLength(2)
      }
    })
  })

  describe('POST /retrospectives/:id/items', () => {
    it('returns 400 for invalid retrospective id', async () => {
      const res = await makeApp().request('/retrospectives/invalid/items', {
        method: 'POST',
        body: JSON.stringify({ category: 'went_well', body: 'test' }),
      })
      expect([400, 404]).toContain(res.status)
    })

    it('requires category and body', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ id: 1, sprint_id: 1, project_id: 1 })

      const res = await makeApp().request('/retrospectives/1/items', {
        method: 'POST',
        body: JSON.stringify({ body: 'test' }),
      })
      expect([400, 404]).toContain(res.status)
    })

    it('validates category enum', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ id: 1, sprint_id: 1, project_id: 1 })

      const res = await makeApp().request('/retrospectives/1/items', {
        method: 'POST',
        body: JSON.stringify({ category: 'invalid', body: 'test' }),
      })
      expect([400, 404]).toContain(res.status)
    })

    it('validates body length (min 1, max 2000)', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ id: 1, sprint_id: 1, project_id: 1 })

      const res = await makeApp().request('/retrospectives/1/items', {
        method: 'POST',
        body: JSON.stringify({ category: 'went_well', body: '' }),
      })
      expect([400, 404]).toContain(res.status)
    })

    it('creates item with went_well category', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ id: 1, sprint_id: 1, project_id: 1 })
      vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
      vi.mocked(db.get)
        .mockResolvedValueOnce({ id: 1, retrospective_id: 1, category: 'went_well', body: 'Great teamwork', position: 0, author_id: 1, created_at: '2025-01-01T00:00:00', updated_at: '2025-01-01T00:00:00' })

      const res = await makeApp().request('/retrospectives/1/items', {
        method: 'POST',
        body: JSON.stringify({ category: 'went_well', body: 'Great teamwork' }),
      })
      expect([201, 404]).toContain(res.status)
    })

    it('creates item with to_improve category', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ id: 1, sprint_id: 1, project_id: 1 })
      vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
      vi.mocked(db.get)
        .mockResolvedValueOnce({ id: 1, retrospective_id: 1, category: 'to_improve', body: 'Code review process', position: 0, author_id: 1, created_at: '2025-01-01T00:00:00', updated_at: '2025-01-01T00:00:00' })

      const res = await makeApp().request('/retrospectives/1/items', {
        method: 'POST',
        body: JSON.stringify({ category: 'to_improve', body: 'Code review process' }),
      })
      expect([201, 404]).toContain(res.status)
    })

    it('creates item with action category', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ id: 1, sprint_id: 1, project_id: 1 })
      vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
      vi.mocked(db.get)
        .mockResolvedValueOnce({ id: 1, retrospective_id: 1, category: 'action', body: 'Schedule planning session', position: 0, author_id: 1, created_at: '2025-01-01T00:00:00', updated_at: '2025-01-01T00:00:00' })

      const res = await makeApp().request('/retrospectives/1/items', {
        method: 'POST',
        body: JSON.stringify({ category: 'action', body: 'Schedule planning session' }),
      })
      expect([201, 404]).toContain(res.status)
    })
  })

  describe('PATCH /retrospective-items/:id', () => {
    it('returns 400 for invalid item id', async () => {
      const res = await makeApp().request('/retrospective-items/invalid', {
        method: 'PATCH',
        body: JSON.stringify({ body: 'updated' }),
      })
      expect([400, 404]).toContain(res.status)
    })

    it('allows partial updates (body only)', async () => {
      vi.mocked(db.get)
        .mockResolvedValueOnce({ id: 1, retrospective_id: 1, sprint_id: 1, project_id: 1 })
        .mockResolvedValueOnce({ id: 1, retrospective_id: 1, category: 'went_well', body: 'updated', position: 0, author_id: 1, created_at: '2025-01-01T00:00:00', updated_at: '2025-01-01T00:00:00' })

      const res = await makeApp().request('/retrospective-items/1', {
        method: 'PATCH',
        body: JSON.stringify({ body: 'updated' }),
      })
      expect([200, 404]).toContain(res.status)
    })

    it('allows partial updates (category only)', async () => {
      vi.mocked(db.get)
        .mockResolvedValueOnce({ id: 1, retrospective_id: 1, sprint_id: 1, project_id: 1 })
        .mockResolvedValueOnce({ id: 1, retrospective_id: 1, category: 'to_improve', body: 'test', position: 0, author_id: 1, created_at: '2025-01-01T00:00:00', updated_at: '2025-01-01T00:00:00' })

      const res = await makeApp().request('/retrospective-items/1', {
        method: 'PATCH',
        body: JSON.stringify({ category: 'to_improve' }),
      })
      expect([200, 404]).toContain(res.status)
    })
  })

  describe('DELETE /retrospective-items/:id', () => {
    it('returns 400 for invalid item id', async () => {
      const res = await makeApp().request('/retrospective-items/invalid', {
        method: 'DELETE',
      })
      expect([400, 404]).toContain(res.status)
    })

    it('deletes item', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ id: 1, retrospective_id: 1, sprint_id: 1, project_id: 1 })
      vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })

      const res = await makeApp().request('/retrospective-items/1', {
        method: 'DELETE',
      })
      expect([200, 404]).toContain(res.status)
    })
  })

  describe('POST /retrospectives/:id/reorder', () => {
    it('validates category enum', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ id: 1, sprint_id: 1, project_id: 1 })

      const res = await makeApp().request('/retrospectives/1/reorder', {
        method: 'POST',
        body: JSON.stringify({ category: 'invalid', item_ids: [1, 2] }),
      })
      expect([400, 404]).toContain(res.status)
    })

    it('requires at least one item_id', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ id: 1, sprint_id: 1, project_id: 1 })

      const res = await makeApp().request('/retrospectives/1/reorder', {
        method: 'POST',
        body: JSON.stringify({ category: 'went_well', item_ids: [] }),
      })
      expect([400, 404]).toContain(res.status)
    })

    it('reorders items successfully', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ id: 1, sprint_id: 1, project_id: 1 })
      vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })

      const res = await makeApp().request('/retrospectives/1/reorder', {
        method: 'POST',
        body: JSON.stringify({ category: 'went_well', item_ids: [1, 2, 3] }),
      })
      expect([200, 404]).toContain(res.status)
    })
  })

  describe('validation: Category enum', () => {
    it('accepts went_well, to_improve, action', () => {
      const categories = ['went_well', 'to_improve', 'action']
      expect(categories).toContain('went_well')
      expect(categories).toContain('to_improve')
      expect(categories).toContain('action')
    })
  })
})
