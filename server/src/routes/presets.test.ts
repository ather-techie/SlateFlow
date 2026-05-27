import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'

vi.mock('../db/index.js', () => ({
  db: {
    all: vi.fn(),
  },
}))

import { db } from '../db/index.js'
import presets from './presets'

function makeApp() {
  const app = new Hono()
  // @ts-ignore
  app.route('/', presets)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('presets routes', () => {
  describe('GET /lane-presets', () => {
    it('returns 200 with empty array when no presets', async () => {
      vi.mocked(db.all).mockResolvedValueOnce([])

      const res = await makeApp().request('/lane-presets')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toEqual([])
    })

    it('returns 200 with single preset', async () => {
      vi.mocked(db.all).mockResolvedValueOnce([
        {
          id: 1,
          name: 'Kanban',
          lanes: '["Backlog","In Progress","Done"]',
        },
      ])

      const res = await makeApp().request('/lane-presets')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toHaveLength(1)
      expect(json.data[0].id).toBe(1)
      expect(json.data[0].name).toBe('Kanban')
    })

    it('parses lanes JSON into array', async () => {
      vi.mocked(db.all).mockResolvedValueOnce([
        {
          id: 1,
          name: 'Scrum',
          lanes: '["To Do","In Progress","Testing","Done"]',
        },
      ])

      const res = await makeApp().request('/lane-presets')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data[0].lanes).toEqual(['To Do', 'In Progress', 'Testing', 'Done'])
      expect(Array.isArray(json.data[0].lanes)).toBe(true)
    })

    it('returns multiple presets sorted by id', async () => {
      vi.mocked(db.all).mockResolvedValueOnce([
        {
          id: 1,
          name: 'Kanban',
          lanes: '["Backlog","In Progress","Done"]',
        },
        {
          id: 2,
          name: 'Scrum',
          lanes: '["To Do","In Progress","Testing","Done"]',
        },
        {
          id: 3,
          name: 'Waterfall',
          lanes: '["Planning","Design","Development","QA","Release"]',
        },
      ])

      const res = await makeApp().request('/lane-presets')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toHaveLength(3)
      expect(json.data[0].id).toBe(1)
      expect(json.data[1].id).toBe(2)
      expect(json.data[2].id).toBe(3)
    })

    it('includes all preset fields in response', async () => {
      vi.mocked(db.all).mockResolvedValueOnce([
        {
          id: 1,
          name: 'Custom',
          lanes: '["Lane1","Lane2","Lane3"]',
        },
      ])

      const res = await makeApp().request('/lane-presets')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data[0]).toHaveProperty('id')
      expect(json.data[0]).toHaveProperty('name')
      expect(json.data[0]).toHaveProperty('lanes')
    })

    it('handles preset with single lane', async () => {
      vi.mocked(db.all).mockResolvedValueOnce([
        {
          id: 1,
          name: 'Single Lane',
          lanes: '["Everything"]',
        },
      ])

      const res = await makeApp().request('/lane-presets')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data[0].lanes).toEqual(['Everything'])
      expect(json.data[0].lanes).toHaveLength(1)
    })

    it('handles preset with many lanes', async () => {
      const manyLanes = Array.from({ length: 20 }, (_, i) => `Lane ${i + 1}`)
      vi.mocked(db.all).mockResolvedValueOnce([
        {
          id: 1,
          name: 'Complex Flow',
          lanes: JSON.stringify(manyLanes),
        },
      ])

      const res = await makeApp().request('/lane-presets')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data[0].lanes).toHaveLength(20)
    })

    it('handles lanes with special characters', async () => {
      vi.mocked(db.all).mockResolvedValueOnce([
        {
          id: 1,
          name: 'Special',
          lanes: '["To-Do","In/Progress","✓ Done"]',
        },
      ])

      const res = await makeApp().request('/lane-presets')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data[0].lanes).toContain('To-Do')
      expect(json.data[0].lanes).toContain('In/Progress')
      expect(json.data[0].lanes).toContain('✓ Done')
    })

    it('returns error property as null on success', async () => {
      vi.mocked(db.all).mockResolvedValueOnce([])

      const res = await makeApp().request('/lane-presets')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.error).toBe(null)
    })

    it('wraps presets in data object', async () => {
      vi.mocked(db.all).mockResolvedValueOnce([
        {
          id: 1,
          name: 'Test',
          lanes: '["A","B"]',
        },
      ])

      const res = await makeApp().request('/lane-presets')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json).toHaveProperty('data')
      expect(Array.isArray(json.data)).toBe(true)
    })

    it('preserves lane order from JSON', async () => {
      vi.mocked(db.all).mockResolvedValueOnce([
        {
          id: 1,
          name: 'Ordered',
          lanes: '["First","Second","Third","Fourth"]',
        },
      ])

      const res = await makeApp().request('/lane-presets')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data[0].lanes[0]).toBe('First')
      expect(json.data[0].lanes[1]).toBe('Second')
      expect(json.data[0].lanes[2]).toBe('Third')
      expect(json.data[0].lanes[3]).toBe('Fourth')
    })
  })

  describe('database query', () => {
    it('queries lane_presets table ordered by id', async () => {
      vi.mocked(db.all).mockResolvedValueOnce([])

      await makeApp().request('/lane-presets')
      expect(vi.mocked(db.all)).toHaveBeenCalledWith(
        'SELECT * FROM lane_presets ORDER BY id',
        expect.anything()
      )
    })
  })

  describe('response envelope', () => {
    it('returns { data, error } format', async () => {
      vi.mocked(db.all).mockResolvedValueOnce([])

      const res = await makeApp().request('/lane-presets')
      const json = await res.json()
      expect(json).toHaveProperty('data')
      expect(json).toHaveProperty('error')
    })
  })
})
