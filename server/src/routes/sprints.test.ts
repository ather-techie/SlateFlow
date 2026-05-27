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
import sprints from './sprints'

const ADMIN = { id: 1, role: 'super_admin', email: 'admin@test.com', display_name: 'Admin' }

function makeApp(user = ADMIN) {
  const app = new Hono()
  // @ts-ignore
  app.use('*', async (c, next) => { c.set('user', user); return next() })
  // @ts-ignore
  app.route('/', sprints)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.run).mockResolvedValue({ lastID: 1, changes: 1 })
  vi.mocked(db.all).mockResolvedValue([])
  vi.mocked(db.transaction).mockImplementation((fn: () => Promise<unknown>) => async () => fn())
})

// ─── GET /projects/:id/sprints ────────────────────────────────────────────────

describe('GET /projects/:id/sprints', () => {
  it('returns 400 for non-numeric project id', async () => {
    const res = await makeApp().request('/projects/abc/sprints')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid id')
  })

  it('returns 404 when project does not exist', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/projects/99/sprints')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('project not found')
  })

  it('returns 200 with empty array when no non-default sprints', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce([])
    const res = await makeApp().request('/projects/1/sprints')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
  })

  it('returns 200 with sprints list (excludes default sprints via SQL filter)', async () => {
    const mockSprints = [
      { id: 2, name: 'Sprint 1', project_id: 1, is_default: 0, status: 'active' },
      { id: 3, name: 'Sprint 2', project_id: 1, is_default: 0, status: 'planned' },
    ]
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce(mockSprints)
    const res = await makeApp().request('/projects/1/sprints')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(mockSprints)
    // Verify the SQL query filters out defaults
    const allCall = vi.mocked(db.all).mock.calls[0]
    expect(allCall[0]).toContain('is_default = 0')
  })
})

// ─── POST /projects/:id/sprints ───────────────────────────────────────────────

describe('POST /projects/:id/sprints', () => {
  const post = (projectId: string | number, body: unknown) =>
    makeApp().request(`/projects/${projectId}/sprints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  const validBody = {
    name: 'Sprint 1',
    start_date: '2024-01-01',
    end_date: '2024-01-14',
  }

  it('returns 400 for non-numeric project id', async () => {
    const res = await post('abc', validBody)
    expect(res.status).toBe(400)
  })

  it('returns 404 when project not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await post(99, validBody)
    expect(res.status).toBe(404)
  })

  it('returns 422 for empty name string (triggers custom min message)', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    const res = await post(1, { name: '', start_date: '2024-01-01', end_date: '2024-01-14' })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toContain('name is required')
  })

  it('returns 422 when start_date is not YYYY-MM-DD format', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    const res = await post(1, { name: 'S1', start_date: '01/01/2024', end_date: '2024-01-14' })
    expect(res.status).toBe(422)
  })

  it('returns 422 when end_date is not YYYY-MM-DD format', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    const res = await post(1, { name: 'S1', start_date: '2024-01-01', end_date: 'Jan 14 2024' })
    expect(res.status).toBe(422)
  })

  it('returns 201 with created sprint', async () => {
    const newSprint = { id: 5, name: 'Sprint 1', project_id: 1, status: 'planned' }
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 })    // project found
      .mockResolvedValueOnce(newSprint)    // SELECT after INSERT
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 5, changes: 1 })

    const res = await post(1, validBody)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data).toEqual(newSprint)
    expect(body.error).toBeNull()
  })

  it('defaults status to "planned" when not provided', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ id: 1, status: 'planned' })
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })

    await post(1, validBody)
    const insertCall = vi.mocked(db.run).mock.calls[0]
    expect(insertCall[6]).toBe('planned') // status arg
  })
})

// ─── PATCH /sprints/:id ───────────────────────────────────────────────────────

describe('PATCH /sprints/:id', () => {
  const patch = (id: string | number, body: unknown) =>
    makeApp().request(`/sprints/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 400 for non-numeric sprint id', async () => {
    const res = await patch('abc', { name: 'X' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when sprint not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await patch(99, { name: 'X' })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('sprint not found')
  })

  it('returns 200 for empty body {} — Zod v4 partial() preserves goal/status defaults', async () => {
    // UpdateSchema = CreateSchema.partial(); Zod v4 keeps goal='' and status='planned'
    // defaults even when the key is absent, so sets.length > 0 and UPDATE runs.
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, name: 'S1', status: 'planned' }) // sprint found
      .mockResolvedValueOnce({ id: 1, name: 'S1', status: 'planned' }) // after update
    const res = await patch(1, {})
    expect(res.status).toBe(200)
  })

  it('returns 422 when date format is invalid', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    const res = await patch(1, { start_date: 'not-a-date' })
    expect(res.status).toBe(422)
  })

  it('returns 422 for invalid status value', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    const res = await patch(1, { status: 'flying' })
    expect(res.status).toBe(422)
  })

  it('returns 200 with updated sprint after name change', async () => {
    const updated = { id: 1, name: 'Sprint Renamed', status: 'active' }
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, name: 'Old', status: 'active' })
      .mockResolvedValueOnce(updated)

    const res = await patch(1, { name: 'Sprint Renamed' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(updated)
  })

  it('returns 200 after status change to "active"', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, status: 'planned' })
      .mockResolvedValueOnce({ id: 1, status: 'active' })

    const res = await patch(1, { status: 'active' })
    expect(res.status).toBe(200)
  })
})

// ─── DELETE /sprints/:id ──────────────────────────────────────────────────────

describe('DELETE /sprints/:id', () => {
  it('returns 400 for non-numeric id', async () => {
    const res = await makeApp().request('/sprints/abc', { method: 'DELETE' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when sprint not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/sprints/99', { method: 'DELETE' })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('sprint not found')
  })

  it('returns 409 when trying to delete the Default Sprint', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, is_default: 1 })
    const res = await makeApp().request('/sprints/1', { method: 'DELETE' })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('Default Sprint')
  })

  it('returns 200 with { id } and nulls out card sprint_ids in transaction', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 5, is_default: 0 })

    const res = await makeApp().request('/sprints/5', { method: 'DELETE' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ id: 5 })

    // transaction wraps card-unlink + delete
    expect(vi.mocked(db.transaction)).toHaveBeenCalledTimes(1)

    // Verify card sprint_id nulling and sprint deletion inside transaction
    const runCalls = vi.mocked(db.run).mock.calls
    const unlinkCall = runCalls.find(c =>
      typeof c[0] === 'string' && (c[0] as string).includes('UPDATE cards SET sprint_id = NULL')
    )
    const deleteCall = runCalls.find(c =>
      typeof c[0] === 'string' && (c[0] as string).includes('DELETE FROM sprints')
    )
    expect(unlinkCall).toBeDefined()
    expect(deleteCall).toBeDefined()
  })
})

// ─── POST /sprints/:id/complete ───────────────────────────────────────────────

describe('POST /sprints/:id/complete', () => {
  it('returns 400 for non-numeric id', async () => {
    const res = await makeApp().request('/sprints/abc/complete', { method: 'POST' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when sprint not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/sprints/99/complete', { method: 'POST' })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('sprint not found')
  })

  it('returns 200, sets status to completed and unlinks cards in transaction', async () => {
    const completedSprint = { id: 2, status: 'completed', velocity_total_points: 10 }
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 2, status: 'active' })           // sprint found
      .mockResolvedValueOnce({ pts: 10 })                            // total points
      .mockResolvedValueOnce({ pts: 8 })                             // completed points
      .mockResolvedValueOnce({ n: 5 })                               // total stories
      .mockResolvedValueOnce({ n: 4 })                               // completed stories
      .mockResolvedValueOnce(completedSprint)                        // final sprint

    const res = await makeApp().request('/sprints/2/complete', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.status).toBe('completed')

    // transaction runs velocity snapshot + card unlink + status update
    expect(vi.mocked(db.transaction)).toHaveBeenCalledTimes(1)

    const runCalls = vi.mocked(db.run).mock.calls
    const unlinkCall = runCalls.find(c =>
      typeof c[0] === 'string' && (c[0] as string).includes('UPDATE cards SET sprint_id = NULL')
    )
    expect(unlinkCall).toBeDefined()
  })
})

// ─── GET /sprints/:id/cards ───────────────────────────────────────────────────

describe('GET /sprints/:id/cards', () => {
  it('returns 400 for non-numeric sprint id', async () => {
    const res = await makeApp().request('/sprints/abc/cards')
    expect(res.status).toBe(400)
  })

  it('returns 404 when sprint not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/sprints/99/cards')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('sprint not found')
  })

  it('returns 200 with cards belonging to sprint', async () => {
    const mockCards = [
      { id: 1, title: 'Story A', sprint_id: 2 },
      { id: 2, title: 'Story B', sprint_id: 2 },
    ]
    vi.mocked(db.get).mockResolvedValueOnce({ id: 2 })
    vi.mocked(db.all).mockResolvedValueOnce(mockCards)

    const res = await makeApp().request('/sprints/2/cards')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(mockCards)
  })
})

// ─── GET /projects/:id/backlog ────────────────────────────────────────────────

describe('GET /projects/:id/backlog', () => {
  it('returns 400 for non-numeric project id', async () => {
    const res = await makeApp().request('/projects/abc/backlog')
    expect(res.status).toBe(400)
  })

  it('returns 404 when project not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/projects/99/backlog')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('project not found')
  })

  it('returns 200 with backlog cards (sprint_id IS NULL)', async () => {
    const backlogCards = [
      { id: 3, title: 'Unplanned Story', sprint_id: null, column_name: 'Backlog' },
    ]
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce(backlogCards)

    const res = await makeApp().request('/projects/1/backlog')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(backlogCards)
  })

  it('uses COALESCE for column_name and column_color in query', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce([])

    await makeApp().request('/projects/1/backlog')
    const allCall = vi.mocked(db.all).mock.calls[0]
    expect(allCall[0]).toContain('COALESCE')
    expect(allCall[0]).toContain('Uncategorized')
  })
})
