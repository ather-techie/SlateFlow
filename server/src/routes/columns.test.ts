import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'

vi.mock('../db/index.js', () => ({
  db: {
    get: vi.fn(),
    all: vi.fn(),
    run: vi.fn(),
    transaction: vi.fn((fn: () => Promise<unknown>) => async () => fn()),
  },
}))

import { db } from '../db/index.js'
import columns from './columns'

const ADMIN = { id: 1, role: 'super_admin', email: 'admin@test.com', display_name: 'Admin' }

function makeApp(user = ADMIN) {
  const app = new Hono()
  // @ts-ignore - inject mock user for route handlers
  app.use('*', async (c, next) => { c.set('user', user); return next() })
  // @ts-ignore
  app.route('/', columns)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.run).mockResolvedValue({ lastID: 1, changes: 1 })
  vi.mocked(db.all).mockResolvedValue([])
  // Restore transaction mock: vi.resetAllMocks() clears vi.fn() factory implementations
  vi.mocked(db.transaction).mockImplementation((fn: () => Promise<unknown>) => async () => fn())
})

// ─── GET /projects/:id/columns ───────────────────────────────────────────────

describe('GET /projects/:id/columns', () => {
  it('returns 400 for non-numeric project id', async () => {
    const res = await makeApp().request('/projects/abc/columns')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid id')
  })

  it('returns 400 for id "0" (zero is not a valid id)', async () => {
    const res = await makeApp().request('/projects/0/columns')
    expect(res.status).toBe(400)
  })

  it('returns 404 when project does not exist', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/projects/99/columns')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('project not found')
  })

  it('returns 200 with empty array when project has no columns', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce([])
    const res = await makeApp().request('/projects/1/columns')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.error).toBeNull()
    expect(body.data).toEqual([])
  })

  it('returns 200 with columns ordered by position', async () => {
    const mockCols = [
      { id: 1, name: 'Todo', project_id: 1, position: 0, color: '#6366f1' },
      { id: 2, name: 'Done', project_id: 1, position: 1, color: '#22c55e' },
    ]
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce(mockCols)
    const res = await makeApp().request('/projects/1/columns')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(mockCols)
  })
})

// ─── POST /projects/:id/columns ──────────────────────────────────────────────

describe('POST /projects/:id/columns', () => {
  const post = (projectId: string | number, body: unknown) =>
    makeApp().request(`/projects/${projectId}/columns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 400 for non-numeric project id', async () => {
    const res = await post('abc', { name: 'Backlog' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when project not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await post(1, { name: 'Backlog' })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('project not found')
  })

  it('returns 422 for empty name string (triggers custom min message)', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    const res = await post(1, { name: '', color: '#aabbcc' })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toContain('name is required')
  })

  it('returns 422 when color is not a valid hex string', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    const res = await post(1, { name: 'Backlog', color: 'not-a-hex' })
    expect(res.status).toBe(422)
  })

  it('returns 201 with created column (auto position = max + 1)', async () => {
    const newCol = { id: 5, name: 'Review', project_id: 1, position: 3, color: '#6366f1' }
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 })     // project found
      .mockResolvedValueOnce({ m: 2 })      // MAX(position) = 2 → new position = 3
      .mockResolvedValueOnce(newCol)        // SELECT after insert
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 5, changes: 1 })

    const res = await post(1, { name: 'Review' })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data).toEqual(newCol)
    expect(body.error).toBeNull()
  })

  it('assigns position 0 when no columns exist yet (MAX = -1)', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ m: -1 })    // no columns yet
      .mockResolvedValueOnce({ id: 1, name: 'Backlog', position: 0 })
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })

    const res = await post(1, { name: 'Backlog' })
    expect(res.status).toBe(201)
  })

  it('accepts explicit position override', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ m: 5 })
      .mockResolvedValueOnce({ id: 2, name: 'QA', position: 0, color: '#6366f1' })
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 2, changes: 1 })

    const res = await post(1, { name: 'QA', position: 0 })
    expect(res.status).toBe(201)
  })
})

// ─── PATCH /columns/:id ──────────────────────────────────────────────────────

describe('PATCH /columns/:id', () => {
  const patch = (id: string | number, body: unknown) =>
    makeApp().request(`/columns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 400 for non-numeric column id', async () => {
    const res = await patch('abc', { name: 'X' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when column not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await patch(99, { name: 'X' })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('column not found')
  })

  it('returns 422 for invalid color hex', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, project_id: 1, position: 0 })
    const res = await patch(1, { color: 'red' })
    expect(res.status).toBe(422)
  })

  it('returns 200 with updated column after name change', async () => {
    const updated = { id: 1, name: 'New Name', project_id: 1, position: 0, color: '#6366f1' }
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, project_id: 1, position: 0 })
      .mockResolvedValueOnce(updated)

    const res = await patch(1, { name: 'New Name' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(updated)
    expect(body.error).toBeNull()
  })

  it('runs sibling shift inside transaction when position changes', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, project_id: 1, position: 0 }) // existing at pos 0
      .mockResolvedValueOnce({ id: 1, project_id: 1, position: 2 }) // after update

    const res = await patch(1, { position: 2 })
    expect(res.status).toBe(200)
    // db.transaction called once for the position shift logic
    expect(vi.mocked(db.transaction)).toHaveBeenCalledTimes(1)
  })

  it('does not shift siblings when position is unchanged', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, project_id: 1, position: 2 }) // same position
      .mockResolvedValueOnce({ id: 1, name: 'Updated', project_id: 1, position: 2 })

    const res = await patch(1, { name: 'Updated', position: 2 })
    expect(res.status).toBe(200)
    // Only the column update db.run, not the shift run
    const runCalls = vi.mocked(db.run).mock.calls
    const shiftCall = runCalls.find(c =>
      typeof c[0] === 'string' && c[0].includes('position + ?')
    )
    expect(shiftCall).toBeUndefined()
  })
})

// ─── DELETE /columns/:id ─────────────────────────────────────────────────────

describe('DELETE /columns/:id', () => {
  it('returns 400 for non-numeric id', async () => {
    const res = await makeApp().request('/columns/abc', { method: 'DELETE' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when column not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/columns/99', { method: 'DELETE' })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('column not found')
  })

  it('returns 200 with { id } on successful delete', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 3 })
    const res = await makeApp().request('/columns/3', { method: 'DELETE' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ id: 3 })
    expect(body.error).toBeNull()
  })

  it('executes DELETE SQL with correct id', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 7 })
    await makeApp().request('/columns/7', { method: 'DELETE' })
    expect(vi.mocked(db.run)).toHaveBeenCalledWith(
      'DELETE FROM columns WHERE id = ?',
      7,
    )
  })
})
