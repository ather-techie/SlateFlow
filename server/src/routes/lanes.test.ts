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
import lanes from './lanes'

const ADMIN = { id: 1, role: 'super_admin', email: 'admin@test.com', display_name: 'Admin' }

function makeApp(user = ADMIN) {
  const app = new Hono()
  // @ts-ignore
  app.use('*', async (c, next) => { c.set('user', user); return next() })
  // @ts-ignore
  app.route('/', lanes)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.run).mockResolvedValue({ lastID: 1, changes: 1 })
  vi.mocked(db.all).mockResolvedValue([])
  vi.mocked(db.transaction).mockImplementation((fn: () => Promise<unknown>) => async () => fn())
})

// ─── GET /projects/:id/lanes ─────────────────────────────────────────────────

describe('GET /projects/:id/lanes', () => {
  it('returns 400 for non-numeric project id', async () => {
    const res = await makeApp().request('/projects/abc/lanes')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid id')
  })

  it('returns 400 for id "0"', async () => {
    const res = await makeApp().request('/projects/0/lanes')
    expect(res.status).toBe(400)
  })

  it('returns 404 when project does not exist', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/projects/1/lanes')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('project not found')
  })

  it('returns 200 with empty array when project has no lanes', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce([])
    const res = await makeApp().request('/projects/1/lanes')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.error).toBeNull()
    expect(body.data).toEqual([])
  })

  it('returns 200 with swim lanes list', async () => {
    const mockLanes = [
      { id: 1, name: 'Backlog', project_id: 1, position: 0, is_done_col: 0, color: '#6366f1' },
      { id: 2, name: 'Done', project_id: 1, position: 1, is_done_col: 1, color: '#22c55e' },
    ]
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce(mockLanes)
    const res = await makeApp().request('/projects/1/lanes')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(mockLanes)
  })
})

// ─── POST /projects/:id/lanes ────────────────────────────────────────────────

describe('POST /projects/:id/lanes', () => {
  const post = (projectId: string | number, body: unknown) =>
    makeApp().request(`/projects/${projectId}/lanes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 400 for non-numeric project id', async () => {
    const res = await post('xyz', { name: 'Backlog' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when project not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await post(1, { name: 'Backlog' })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('project not found')
  })

  it('returns 422 when name is missing', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    const res = await post(1, { color: '#aabbcc' })
    expect(res.status).toBe(422)
  })

  it('returns 422 for empty name string (triggers custom min message)', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    const res = await post(1, { name: '' })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toContain('name is required')
  })

  it('returns 422 for invalid color (not hex)', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    const res = await post(1, { name: 'Review', color: 'blue' })
    expect(res.status).toBe(422)
  })

  it('returns 201 with created lane (position = MAX + 1)', async () => {
    const newLane = { id: 3, name: 'Review', project_id: 1, position: 2, color: '#6366f1' }
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 })    // project found
      .mockResolvedValueOnce({ m: 1 })     // MAX(position) = 1 → new = 2
      .mockResolvedValueOnce(newLane)      // SELECT after insert
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 3, changes: 1 })

    const res = await post(1, { name: 'Review' })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data).toEqual(newLane)
  })

  it('assigns position 0 when no lanes exist (MAX = -1)', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ m: -1 })
      .mockResolvedValueOnce({ id: 1, name: 'Backlog', position: 0 })
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })

    const res = await post(1, { name: 'Backlog' })
    expect(res.status).toBe(201)
  })

  it('accepts 3-char hex color (#abc)', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ m: -1 })
      .mockResolvedValueOnce({ id: 1, name: 'A', color: '#abc', position: 0 })
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })

    const res = await post(1, { name: 'A', color: '#abc' })
    expect(res.status).toBe(201)
  })
})

// ─── PATCH /lanes/:id ────────────────────────────────────────────────────────

describe('PATCH /lanes/:id', () => {
  const patch = (id: string | number, body: unknown) =>
    makeApp().request(`/lanes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 400 for non-numeric lane id', async () => {
    const res = await patch('abc', { name: 'X' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when lane not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await patch(99, { name: 'X' })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('lane not found')
  })

  it('returns 422 for invalid hex color', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, project_id: 1, position: 0 })
    const res = await patch(1, { color: 'purple' })
    expect(res.status).toBe(422)
  })

  it('returns 200 after updating lane name', async () => {
    const updated = { id: 1, name: 'Updated', project_id: 1, position: 0, color: '#6366f1' }
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, project_id: 1, position: 0 })
      .mockResolvedValueOnce(updated)

    const res = await patch(1, { name: 'Updated' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(updated)
  })

  it('updates is_done_col flag', async () => {
    const updated = { id: 1, name: 'Done', project_id: 1, position: 2, is_done_col: 1 }
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, project_id: 1, position: 2 })
      .mockResolvedValueOnce(updated)

    const res = await patch(1, { is_done_col: true })
    expect(res.status).toBe(200)
  })

  it('shifts sibling lanes inside transaction when position changes', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, project_id: 1, position: 0 })
      .mockResolvedValueOnce({ id: 1, project_id: 1, position: 3 })

    const res = await patch(1, { position: 3 })
    expect(res.status).toBe(200)
    expect(vi.mocked(db.transaction)).toHaveBeenCalledTimes(1)
  })
})

// ─── DELETE /lanes/:id ───────────────────────────────────────────────────────

describe('DELETE /lanes/:id', () => {
  it('returns 400 for non-numeric id', async () => {
    const res = await makeApp().request('/lanes/abc', { method: 'DELETE' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when lane not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/lanes/99', { method: 'DELETE' })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('lane not found')
  })

  it('returns 409 with card_count in meta when lane has cards', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 })       // lane found
      .mockResolvedValueOnce({ n: 3 })        // 3 cards in lane

    const res = await makeApp().request('/lanes/1', { method: 'DELETE' })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('3 card(s)')
    expect(body.meta).toEqual({ card_count: 3 })
    expect(body.data).toBeNull()
  })

  it('returns 200 with { id } when lane is empty', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 4 })       // lane found
      .mockResolvedValueOnce({ n: 0 })        // no cards

    const res = await makeApp().request('/lanes/4', { method: 'DELETE' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ id: 4 })
    expect(body.error).toBeNull()
  })

  it('executes DELETE SQL with correct id', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 7 })
      .mockResolvedValueOnce({ n: 0 })

    await makeApp().request('/lanes/7', { method: 'DELETE' })
    expect(vi.mocked(db.run)).toHaveBeenCalledWith('DELETE FROM swim_lanes WHERE id = ?', 7)
  })
})

// ─── POST /projects/:id/lanes/reorder ────────────────────────────────────────

describe('POST /projects/:id/lanes/reorder', () => {
  const reorder = (projectId: string | number, body: unknown) =>
    makeApp().request(`/projects/${projectId}/lanes/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 400 for non-numeric project id', async () => {
    const res = await reorder('abc', { ordered_ids: [1, 2] })
    expect(res.status).toBe(400)
  })

  it('returns 404 when project not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await reorder(1, { ordered_ids: [1, 2] })
    expect(res.status).toBe(404)
  })

  it('returns 422 when ordered_ids is empty', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    const res = await reorder(1, { ordered_ids: [] })
    expect(res.status).toBe(422)
  })

  it('returns 400 when a lane id does not belong to the project', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })  // project found
    // All lanes in project: only id 1 and 2 exist
    vi.mocked(db.all).mockResolvedValueOnce([{ id: 1 }, { id: 2 }])

    const res = await reorder(1, { ordered_ids: [1, 2, 99] }) // 99 is foreign
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('do not belong to this project')
  })

  it('returns 200 with reordered lanes after valid reorder', async () => {
    const reordered = [
      { id: 2, name: 'In Progress', position: 0 },
      { id: 1, name: 'Backlog', position: 1 },
    ]
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })    // project found
    vi.mocked(db.all)
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])     // project lane ids
      .mockResolvedValueOnce(reordered)                   // final lanes after reorder

    const res = await reorder(1, { ordered_ids: [2, 1] })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(reordered)
    // transaction called for bulk position updates
    expect(vi.mocked(db.transaction)).toHaveBeenCalledTimes(1)
  })
})
