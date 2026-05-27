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
import activity from './activity'

const ADMIN = { id: 1, role: 'super_admin', email: 'admin@test.com', display_name: 'Admin' }

function makeApp(user = ADMIN) {
  const app = new Hono()
  // @ts-ignore
  app.use('*', async (c, next) => { c.set('user', user); return next() })
  // @ts-ignore
  app.route('/', activity)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ─── GET /cards/:id/activity ──────────────────────────────────────────────────

describe('GET /cards/:id/activity', () => {
  it('returns 400 for non-numeric card id', async () => {
    const res = await makeApp().request('/cards/abc/activity')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid id')
  })

  it('returns 404 when card not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/cards/99/activity')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('card not found')
  })

  it('returns 200 with empty array when no activity exists', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce([])

    const res = await makeApp().request('/cards/1/activity')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
  })

  it('returns 200 with activity ordered by created_at DESC', async () => {
    const mockActivity = [
      { id: 3, card_id: 1, action: 'update', meta: '{}', user_id: 1, created_at: '2024-01-03' },
      { id: 2, card_id: 1, action: 'move', meta: '{}', user_id: 1, created_at: '2024-01-02' },
      { id: 1, card_id: 1, action: 'create', meta: '{}', user_id: 1, created_at: '2024-01-01' },
    ]
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce(mockActivity)

    const res = await makeApp().request('/cards/1/activity')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(mockActivity)
    expect(body.data[0].id).toBe(3) // most recent first
  })

  it('returns all activity types', async () => {
    const mockActivity = [
      { id: 1, card_id: 1, action: 'create', meta: '{}', user_id: 1, created_at: '2024-01-01' },
      { id: 2, card_id: 1, action: 'update', meta: '{}', user_id: 1, created_at: '2024-01-02' },
      { id: 3, card_id: 1, action: 'move', meta: '{}', user_id: 1, created_at: '2024-01-03' },
    ]
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce(mockActivity)

    const res = await makeApp().request('/cards/1/activity')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.length).toBe(3)
  })
})

// ─── GET /projects/:id/activity ───────────────────────────────────────────────

describe('GET /projects/:id/activity', () => {
  it('returns 400 for non-numeric project id', async () => {
    const res = await makeApp().request('/projects/abc/activity')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid id')
  })

  it('returns 404 when project not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/projects/99/activity')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('project not found')
  })

  it('returns 200 with empty array when no activity exists for project', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce([])

    const res = await makeApp().request('/projects/1/activity')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
  })

  it('returns 200 with project activity from all cards', async () => {
    const mockActivity = [
      { id: 1, card_id: 1, action: 'create', meta: '{}', user_id: 1, created_at: '2024-01-01' },
      { id: 2, card_id: 2, action: 'update', meta: '{}', user_id: 2, created_at: '2024-01-02' },
      { id: 3, card_id: 3, action: 'move', meta: '{}', user_id: 1, created_at: '2024-01-03' },
    ]
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce(mockActivity)

    const res = await makeApp().request('/projects/1/activity')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(mockActivity)
  })

  it('limits results to 50 entries', async () => {
    const mockActivity = Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      card_id: 1,
      action: 'update',
      meta: '{}',
      user_id: 1,
      created_at: '2024-01-01',
    }))
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce(mockActivity)

    const res = await makeApp().request('/projects/1/activity')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.length).toBe(50)
  })

  it('returns most recent activity first', async () => {
    const mockActivity = [
      { id: 3, card_id: 1, action: 'update', meta: '{}', user_id: 1, created_at: '2024-01-03' },
      { id: 2, card_id: 2, action: 'update', meta: '{}', user_id: 1, created_at: '2024-01-02' },
      { id: 1, card_id: 3, action: 'create', meta: '{}', user_id: 1, created_at: '2024-01-01' },
    ]
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce(mockActivity)

    const res = await makeApp().request('/projects/1/activity')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data[0].created_at).toBe('2024-01-03')
  })

  it('includes activity from swim_lane based cards', async () => {
    const mockActivity = [
      { id: 1, card_id: 1, action: 'create', meta: '{}', user_id: 1, created_at: '2024-01-01' },
    ]
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce(mockActivity)

    const res = await makeApp().request('/projects/1/activity')
    expect(res.status).toBe(200)
    expect(vi.mocked(db.all)).toHaveBeenCalledWith(
      expect.stringContaining('swim_lanes'),
      1,
      1
    )
  })

  it('includes activity from legacy column-based cards', async () => {
    const mockActivity = []
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce(mockActivity)

    const res = await makeApp().request('/projects/1/activity')
    expect(res.status).toBe(200)
    expect(vi.mocked(db.all)).toHaveBeenCalledWith(
      expect.stringContaining('columns'),
      expect.anything(),
      expect.anything()
    )
  })
})
