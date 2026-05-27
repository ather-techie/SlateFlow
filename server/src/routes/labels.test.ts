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
import labels from './labels'

const ADMIN = { id: 1, role: 'super_admin', email: 'admin@test.com', display_name: 'Admin' }

function makeApp(user = ADMIN) {
  const app = new Hono()
  // @ts-ignore
  app.use('*', async (c, next) => { c.set('user', user); return next() })
  // @ts-ignore
  app.route('/', labels)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ─── GET /projects/:id/labels ─────────────────────────────────────────────────

describe('GET /projects/:id/labels', () => {
  it('returns 400 for non-numeric project id', async () => {
    const res = await makeApp().request('/projects/abc/labels')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid id')
  })

  it('returns 200 with empty array when no labels exist', async () => {
    vi.mocked(db.all).mockResolvedValueOnce([])
    const res = await makeApp().request('/projects/1/labels')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
    expect(body.error).toBeNull()
  })

  it('returns 200 with labels sorted by name', async () => {
    const mockLabels = [
      { id: 1, project_id: 1, name: 'Bug', color: '#ff0000' },
      { id: 2, project_id: 1, name: 'Feature', color: '#00ff00' },
    ]
    vi.mocked(db.all).mockResolvedValueOnce(mockLabels)
    const res = await makeApp().request('/projects/1/labels')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(mockLabels)
  })
})

// ─── POST /projects/:id/labels ────────────────────────────────────────────────

describe('POST /projects/:id/labels', () => {
  const post = (projectId: string | number, body: unknown) =>
    makeApp().request(`/projects/${projectId}/labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 400 for non-numeric project id', async () => {
    const res = await post('abc', { name: 'Bug' })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid id')
  })

  it('returns 400 for invalid JSON', async () => {
    const res = await makeApp().request('/projects/1/labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    })
    expect(res.status).toBe(400)
  })

  it('returns 422 when name is missing', async () => {
    const res = await post(1, { color: '#ff0000' })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it('returns 422 when name is empty string', async () => {
    const res = await post(1, { name: '', color: '#ff0000' })
    expect(res.status).toBe(422)
  })

  it('returns 422 when name exceeds 100 characters', async () => {
    const longName = 'a'.repeat(101)
    const res = await post(1, { name: longName })
    expect(res.status).toBe(422)
  })

  it('returns 422 when color format is invalid', async () => {
    const res = await post(1, { name: 'Bug', color: 'not-a-hex' })
    expect(res.status).toBe(422)
  })

  it('returns 201 with created label using default color', async () => {
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, project_id: 1, name: 'Bug', color: '#6366f1' })
    const res = await post(1, { name: 'Bug' })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.name).toBe('Bug')
    expect(body.data.color).toBe('#6366f1')
  })

  it('returns 201 with created label using custom color', async () => {
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 2, changes: 1 })
    vi.mocked(db.get).mockResolvedValueOnce({ id: 2, project_id: 1, name: 'Feature', color: '#00ff00' })
    const res = await post(1, { name: 'Feature', color: '#00ff00' })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.name).toBe('Feature')
    expect(body.data.color).toBe('#00ff00')
  })
})

// ─── GET /cards/:id/labels ───────────────────────────────────────────────────

describe('GET /cards/:id/labels', () => {
  it('returns 400 for non-numeric card id', async () => {
    const res = await makeApp().request('/cards/abc/labels')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid id')
  })

  it('returns 200 with empty array when card has no labels', async () => {
    vi.mocked(db.all).mockResolvedValueOnce([])
    const res = await makeApp().request('/cards/1/labels')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
  })

  it('returns 200 with labels for card', async () => {
    const mockLabels = [
      { id: 1, project_id: 1, name: 'Bug', color: '#ff0000' },
    ]
    vi.mocked(db.all).mockResolvedValueOnce(mockLabels)
    const res = await makeApp().request('/cards/1/labels')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(mockLabels)
  })
})

// ─── POST /cards/:id/labels ──────────────────────────────────────────────────

describe('POST /cards/:id/labels', () => {
  const post = (cardId: string | number, body: unknown) =>
    makeApp().request(`/cards/${cardId}/labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 400 for non-numeric card id', async () => {
    const res = await post('abc', { label_id: 1 })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid JSON', async () => {
    const res = await makeApp().request('/cards/1/labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    })
    expect(res.status).toBe(400)
  })

  it('returns 422 when label_id is missing', async () => {
    const res = await post(1, {})
    expect(res.status).toBe(422)
  })

  it('returns 422 when label_id is not a positive integer', async () => {
    const res = await post(1, { label_id: 0 })
    expect(res.status).toBe(422)
  })

  it('returns 200 when label is successfully attached (idempotent)', async () => {
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
    const res = await post(1, { label_id: 5 })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.card_id).toBe(1)
    expect(body.data.label_id).toBe(5)
  })

  it('returns 200 when label already exists (idempotent)', async () => {
    vi.mocked(db.run).mockRejectedValueOnce(new Error('UNIQUE constraint failed'))
    const res = await post(1, { label_id: 5 })
    expect(res.status).toBe(200)
  })
})

// ─── DELETE /cards/:id/labels/:labelId ─────────────────────────────────────

describe('DELETE /cards/:id/labels/:labelId', () => {
  it('returns 400 for non-numeric card id', async () => {
    const res = await makeApp().request('/cards/abc/labels/1', { method: 'DELETE' })
    expect(res.status).toBe(400)
  })

  it('returns 400 for non-numeric label id', async () => {
    const res = await makeApp().request('/cards/1/labels/abc', { method: 'DELETE' })
    expect(res.status).toBe(400)
  })

  it('returns 200 when label is successfully detached', async () => {
    vi.mocked(db.run).mockResolvedValueOnce({ changes: 1 })
    const res = await makeApp().request('/cards/1/labels/5', { method: 'DELETE' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.card_id).toBe(1)
    expect(body.data.label_id).toBe(5)
  })

  it('returns 200 even when label does not exist on card', async () => {
    vi.mocked(db.run).mockResolvedValueOnce({ changes: 0 })
    const res = await makeApp().request('/cards/1/labels/99', { method: 'DELETE' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.card_id).toBe(1)
    expect(body.data.label_id).toBe(99)
  })
})
