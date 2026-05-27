import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'

vi.mock('../db/index.js', () => ({
  db: {
    get: vi.fn(),
    all: vi.fn(),
    run: vi.fn(),
  },
}))

import { db } from '../db/index.js'
import roadmap from './roadmap'

const ADMIN = { id: 1, role: 'super_admin', email: 'admin@test.com', display_name: 'Admin' }
const USER = { id: 2, role: 'global_reader', email: 'user@test.com', display_name: 'User' }

function makeApp(user = ADMIN) {
  const app = new Hono()
  // @ts-ignore
  app.use('*', async (c, next) => { c.set('user', user); return next() })
  // @ts-ignore
  app.route('/', roadmap)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('GET /projects/:id/roadmap', () => {
  describe('valid inputs', () => {
    it('returns 200 with epics and features for super_admin', async () => {
      const projectId = 1
      vi.mocked(db.get).mockResolvedValueOnce({ id: projectId })
      vi.mocked(db.all)
        .mockResolvedValueOnce([
          { id: 1, title: 'Epic 1', status: 'active', priority: 'high', start_date: '2025-01-01', end_date: '2025-12-31', is_default: 0, position: 0, feature_count: 2, story_count: 5 },
        ])
        .mockResolvedValueOnce([
          { id: 1, epic_id: 1, title: 'Feature 1', status: 'active', priority: 'high', start_date: '2025-01-01', end_date: '2025-06-30', is_default: 0, position: 0, story_count: 3, done_story_count: 1 },
          { id: 2, epic_id: 1, title: 'Feature 2', status: 'planning', priority: 'medium', start_date: '2025-07-01', end_date: '2025-12-31', is_default: 0, position: 1, story_count: 2, done_story_count: 0 },
        ])

      const res = await makeApp().request('/projects/1/roadmap')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toHaveLength(1)
      expect(json.data[0].id).toBe(1)
      expect(json.data[0].features).toHaveLength(2)
    })

    it('returns 200 with empty array when no epics', async () => {
      const projectId = 1
      vi.mocked(db.get).mockResolvedValueOnce({ id: projectId })
      vi.mocked(db.all).mockResolvedValueOnce([])

      const res = await makeApp().request('/projects/1/roadmap')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toEqual([])
    })

    it('returns 200 for global_reader with epic_access', async () => {
      const projectId = 1
      vi.mocked(db.get).mockResolvedValueOnce({ id: projectId })
      vi.mocked(db.all)
        .mockResolvedValueOnce([
          { id: 1, title: 'Epic 1', status: 'active', priority: 'high', start_date: '2025-01-01', end_date: '2025-12-31', is_default: 0, position: 0, feature_count: 1, story_count: 2 },
        ])
        .mockResolvedValueOnce([
          { id: 1, epic_id: 1, title: 'Feature 1', status: 'active', priority: 'high', start_date: '2025-01-01', end_date: '2025-06-30', is_default: 0, position: 0, story_count: 2, done_story_count: 1 },
        ])

      const res = await makeApp(USER).request('/projects/1/roadmap')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toHaveLength(1)
    })
  })

  describe('invalid inputs', () => {
    it('returns 400 for invalid project id', async () => {
      const res = await makeApp().request('/projects/invalid/roadmap')
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toBe('invalid id')
    })

    it('returns 404 when project not found', async () => {
      vi.mocked(db.get).mockResolvedValueOnce(null)

      const res = await makeApp().request('/projects/999/roadmap')
      expect(res.status).toBe(404)
      const json = await res.json()
      expect(json.error).toBe('project not found')
    })
  })

  describe('edge cases', () => {
    it('returns 200 with default items filtered out', async () => {
      const projectId = 1
      vi.mocked(db.get).mockResolvedValueOnce({ id: projectId })
      vi.mocked(db.all)
        .mockResolvedValueOnce([
          { id: 1, title: 'Real Epic', status: 'active', priority: 'high', start_date: '2025-01-01', end_date: '2025-12-31', is_default: 0, position: 0, feature_count: 0, story_count: 0 },
        ])
        .mockResolvedValueOnce([])

      const res = await makeApp().request('/projects/1/roadmap')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data[0].features).toEqual([])
    })

    it('handles epics with no features', async () => {
      const projectId = 1
      vi.mocked(db.get).mockResolvedValueOnce({ id: projectId })
      vi.mocked(db.all)
        .mockResolvedValueOnce([
          { id: 1, title: 'Empty Epic', status: 'planning', priority: 'low', start_date: '2025-01-01', end_date: '2025-12-31', is_default: 0, position: 0, feature_count: 0, story_count: 0 },
        ])
        .mockResolvedValueOnce([])

      const res = await makeApp().request('/projects/1/roadmap')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toHaveLength(1)
      expect(json.data[0].features).toEqual([])
    })

    it('preserves feature order and position', async () => {
      const projectId = 1
      vi.mocked(db.get).mockResolvedValueOnce({ id: projectId })
      vi.mocked(db.all)
        .mockResolvedValueOnce([
          { id: 1, title: 'Epic', status: 'active', priority: 'high', start_date: '2025-01-01', end_date: '2025-12-31', is_default: 0, position: 0, feature_count: 3, story_count: 3 },
        ])
        .mockResolvedValueOnce([
          { id: 1, epic_id: 1, title: 'First', status: 'active', priority: 'high', start_date: '2025-01-01', end_date: '2025-04-30', is_default: 0, position: 0, story_count: 1, done_story_count: 0 },
          { id: 2, epic_id: 1, title: 'Second', status: 'planning', priority: 'medium', start_date: '2025-05-01', end_date: '2025-08-31', is_default: 0, position: 1, story_count: 1, done_story_count: 0 },
          { id: 3, epic_id: 1, title: 'Third', status: 'backlog', priority: 'low', start_date: '2025-09-01', end_date: '2025-12-31', is_default: 0, position: 2, story_count: 1, done_story_count: 0 },
        ])

      const res = await makeApp().request('/projects/1/roadmap')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data[0].features).toHaveLength(3)
      expect(json.data[0].features[0].id).toBe(1)
      expect(json.data[0].features[1].id).toBe(2)
      expect(json.data[0].features[2].id).toBe(3)
    })
  })
})
