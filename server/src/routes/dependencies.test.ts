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
import dependencies from './dependencies'

const ADMIN = { id: 1, role: 'super_admin', email: 'admin@test.com', display_name: 'Admin' }

function makeApp(user = ADMIN) {
  const app = new Hono()
  // @ts-ignore
  app.use('*', async (c, next) => { c.set('user', user); return next() })
  // @ts-ignore
  app.route('/', dependencies)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ─── GET /cards/:id/dependencies ──────────────────────────────────────────────

describe('GET /cards/:id/dependencies', () => {
  it('returns 400 for non-numeric card id', async () => {
    const res = await makeApp().request('/cards/abc/dependencies')
    expect(res.status).toBe(400)
  })

  it('returns 404 when card not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/cards/99/dependencies')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('card not found')
  })

  it('returns 200 with empty blocks and blocked_by when no dependencies exist', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce([]) // blocks
    vi.mocked(db.all).mockResolvedValueOnce([]) // blocked_by

    const res = await makeApp().request('/cards/1/dependencies')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.blocks).toEqual([])
    expect(body.data.blocked_by).toEqual([])
  })

  it('returns 200 with cards this one blocks', async () => {
    const blockedCards = [
      { dep_id: 1, id: 2, title: 'Blocked Card', priority: 'high', story_points: 5, assignee: 'user', swim_lane_id: 1 },
    ]
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce(blockedCards)
    vi.mocked(db.all).mockResolvedValueOnce([])

    const res = await makeApp().request('/cards/1/dependencies')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.blocks).toEqual(blockedCards)
  })

  it('returns 200 with cards that block this one', async () => {
    const blockerCards = [
      { dep_id: 2, id: 3, title: 'Blocking Card', priority: 'critical', story_points: 8, assignee: 'admin', swim_lane_id: 2 },
    ]
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce([])
    vi.mocked(db.all).mockResolvedValueOnce(blockerCards)

    const res = await makeApp().request('/cards/1/dependencies')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.blocked_by).toEqual(blockerCards)
  })

  it('returns 200 with both blocks and blocked_by', async () => {
    const blockedCards = [
      { dep_id: 1, id: 2, title: 'Blocked', priority: 'high', story_points: 5, assignee: 'user', swim_lane_id: 1 },
    ]
    const blockerCards = [
      { dep_id: 2, id: 3, title: 'Blocker', priority: 'critical', story_points: 8, assignee: 'admin', swim_lane_id: 2 },
    ]
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce(blockedCards)
    vi.mocked(db.all).mockResolvedValueOnce(blockerCards)

    const res = await makeApp().request('/cards/1/dependencies')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.blocks).toEqual(blockedCards)
    expect(body.data.blocked_by).toEqual(blockerCards)
  })
})

// ─── POST /cards/:id/dependencies ─────────────────────────────────────────────

describe('POST /cards/:id/dependencies', () => {
  const post = (cardId: string | number, body: unknown) =>
    makeApp().request(`/cards/${cardId}/dependencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 400 for non-numeric card id', async () => {
    const res = await post('abc', { target_id: 2, type: 'blocks' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when card not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await post(99, { target_id: 2, type: 'blocks' })
    expect(res.status).toBe(404)
  })

  it('returns 400 for invalid JSON', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    const res = await makeApp().request('/cards/1/dependencies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    })
    expect(res.status).toBe(400)
  })

  it('returns 422 when target_id is missing', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    const res = await post(1, { type: 'blocks' })
    expect(res.status).toBe(422)
  })

  it('returns 422 when target_id is not positive integer', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    const res = await post(1, { target_id: 0, type: 'blocks' })
    expect(res.status).toBe(422)
  })

  it('returns 422 when type is missing', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    const res = await post(1, { target_id: 2 })
    expect(res.status).toBe(422)
  })

  it('returns 422 when type is invalid', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    const res = await post(1, { target_id: 2, type: 'invalid' })
    expect(res.status).toBe(422)
  })

  it('returns 400 when a story blocks itself', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    const res = await post(1, { target_id: 1, type: 'blocks' })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('a story cannot depend on itself')
  })

  it('returns 404 when target card not found', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 }) // source card
      .mockResolvedValueOnce(undefined) // target card not found
    const res = await post(1, { target_id: 99, type: 'blocks' })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('target card not found')
  })

  it('returns 201 when "blocks" dependency is created', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ id: 2 })
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, blocker_id: 1, blocked_id: 2 })

    const res = await post(1, { target_id: 2, type: 'blocks' })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.blocker_id).toBe(1)
    expect(body.data.blocked_id).toBe(2)
  })

  it('returns 201 when "blocked_by" dependency is created', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 2 })
      .mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 2, changes: 1 })
    vi.mocked(db.get).mockResolvedValueOnce({ id: 2, blocker_id: 1, blocked_id: 2 })

    const res = await post(2, { target_id: 1, type: 'blocked_by' })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.blocker_id).toBe(1)
    expect(body.data.blocked_id).toBe(2)
  })

  it('returns 409 when dependency already exists', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ id: 2 })
    vi.mocked(db.run).mockRejectedValueOnce(new Error('UNIQUE constraint failed'))

    const res = await post(1, { target_id: 2, type: 'blocks' })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('dependency already exists')
  })
})

// ─── DELETE /dependencies/:id ─────────────────────────────────────────────────

describe('DELETE /dependencies/:id', () => {
  it('returns 400 for non-numeric dependency id', async () => {
    const res = await makeApp().request('/dependencies/abc', { method: 'DELETE' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when dependency not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/dependencies/99', { method: 'DELETE' })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('dependency not found')
  })

  it('returns 200 when dependency is deleted', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.run).mockResolvedValueOnce({ changes: 1 })

    const res = await makeApp().request('/dependencies/1', { method: 'DELETE' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.id).toBe(1)
  })

  it('calls db.run with correct DELETE statement', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 5 })
    vi.mocked(db.run).mockResolvedValueOnce({ changes: 1 })

    await makeApp().request('/dependencies/5', { method: 'DELETE' })
    expect(vi.mocked(db.run)).toHaveBeenCalledWith(
      'DELETE FROM story_dependencies WHERE id = ?',
      5
    )
  })
})
