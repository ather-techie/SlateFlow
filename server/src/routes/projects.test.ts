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

vi.mock('../lib/projectAccess.js', () => ({
  canWrite: vi.fn().mockResolvedValue(true),
  canRead: vi.fn().mockReturnValue(true),
  canManageUsers: vi.fn().mockResolvedValue(false),
}))

import { db } from '../db/index.js'
import { canWrite } from '../lib/projectAccess.js'
import projects from './projects'

const ADMIN = { id: 1, role: 'super_admin', email: 'admin@test.com', display_name: 'Admin' }
const READER = { id: 2, role: 'global_reader', email: 'user@test.com', display_name: 'User' }

function makeApp(user = ADMIN) {
  const app = new Hono()
  // @ts-ignore
  app.use('*', async (c, next) => { c.set('user', user); return next() })
  // @ts-ignore
  app.route('/', projects)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.run).mockResolvedValue({ lastID: 1, changes: 1 })
  vi.mocked(db.all).mockResolvedValue([])
  vi.mocked(canWrite).mockResolvedValue(true)
  // vi.resetAllMocks() clears the factory implementation; restore it so route
  // handlers that call db.transaction(fn)() don't throw "not a function"
  vi.mocked(db.transaction).mockImplementation((fn: () => Promise<unknown>) => async () => fn())
})

// ─── GET /projects ────────────────────────────────────────────────────────────

describe('GET /projects', () => {
  it('returns 200 with empty array when no projects', async () => {
    vi.mocked(db.all).mockResolvedValueOnce([])
    const res = await makeApp().request('/projects')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
    expect(body.error).toBeNull()
  })

  it('returns 200 with list of projects including lane_count', async () => {
    const mockProjects = [
      { id: 1, name: 'Alpha', color: '#6366f1', lane_count: 3 },
      { id: 2, name: 'Beta',  color: '#22c55e', lane_count: 2 },
    ]
    vi.mocked(db.all).mockResolvedValueOnce(mockProjects)
    const res = await makeApp().request('/projects')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(mockProjects)
  })
})

// ─── POST /projects ───────────────────────────────────────────────────────────

describe('POST /projects', () => {
  const post = (body: unknown) =>
    makeApp().request('/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 422 when neither preset_id nor custom_lanes provided', async () => {
    const res = await post({ name: 'My Project' })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toContain('preset_id or custom_lanes is required')
  })

  it('returns 422 when both preset_id and custom_lanes provided', async () => {
    const res = await post({ name: 'X', preset_id: 1, custom_lanes: ['A', 'B'] })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toContain('only one of preset_id or custom_lanes')
  })

  it('returns 422 when custom_lanes has fewer than 2 entries', async () => {
    const res = await post({ name: 'X', custom_lanes: ['Only'] })
    expect(res.status).toBe(422)
  })

  it('returns 422 when custom_lanes has more than 12 entries', async () => {
    const tooMany = Array.from({ length: 13 }, (_, i) => `Lane ${i}`)
    const res = await post({ name: 'X', custom_lanes: tooMany })
    expect(res.status).toBe(422)
  })

  it('returns 422 when name is missing', async () => {
    const res = await post({ custom_lanes: ['Todo', 'Done'] })
    expect(res.status).toBe(422)
  })

  it('returns 404 when preset_id does not exist', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined) // preset not found
    const res = await post({ name: 'My Project', preset_id: 999 })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('lane preset not found')
  })

  it('returns 201 with project and swim_lanes using preset_id', async () => {
    const createdProject = { id: 10, name: 'My Project', color: '#6366f1', description: '' }
    const lane1 = { id: 1, name: 'Todo', project_id: 10, position: 0, is_done_col: 0 }
    const lane2 = { id: 2, name: 'Done', project_id: 10, position: 1, is_done_col: 1 }

    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, lanes: JSON.stringify(['Todo', 'Done']) })  // preset
      .mockResolvedValueOnce(lane1)   // SELECT lane 1
      .mockResolvedValueOnce(lane2)   // SELECT lane 2
      .mockResolvedValueOnce(createdProject) // SELECT project after insert
    vi.mocked(db.run)
      .mockResolvedValueOnce({ lastID: 10, changes: 1 })  // INSERT project
      .mockResolvedValueOnce({ lastID: 1, changes: 1 })   // INSERT lane 1
      .mockResolvedValueOnce({ lastID: 2, changes: 1 })   // INSERT lane 2
      .mockResolvedValue({ lastID: 0, changes: 1 })        // default/epic/feature/sprint inserts

    const res = await post({ name: 'My Project', preset_id: 1 })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.error).toBeNull()
    expect(body.data).toHaveProperty('swim_lanes')
  })

  it('returns 201 with project using custom_lanes', async () => {
    const createdProject = { id: 11, name: 'Custom', color: '#6366f1' }
    const lane1 = { id: 3, name: 'Backlog', project_id: 11, is_done_col: 0 }
    const lane2 = { id: 4, name: 'Release', project_id: 11, is_done_col: 1 }

    vi.mocked(db.get)
      .mockResolvedValueOnce(lane1)
      .mockResolvedValueOnce(lane2)
      .mockResolvedValueOnce(createdProject)
    vi.mocked(db.run)
      .mockResolvedValueOnce({ lastID: 11, changes: 1 })
      .mockResolvedValueOnce({ lastID: 3, changes: 1 })
      .mockResolvedValueOnce({ lastID: 4, changes: 1 })
      .mockResolvedValue({ lastID: 0, changes: 1 })

    const res = await post({ name: 'Custom', custom_lanes: ['Backlog', 'Release'] })
    expect(res.status).toBe(201)
  })

  it('marks the last lane as is_done_col=1 in the transaction', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, name: 'L1' })  // lane 1
      .mockResolvedValueOnce({ id: 2, name: 'L2' })  // lane 2 (last = done)
      .mockResolvedValueOnce({ id: 5, name: 'P' })   // project
    vi.mocked(db.run).mockResolvedValue({ lastID: 1, changes: 1 })

    await post({ name: 'P', custom_lanes: ['L1', 'L2'] })
    // The last INSERT INTO swim_lanes should have is_done_col = 1
    const insertCalls = vi.mocked(db.run).mock.calls.filter(
      c => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO swim_lanes')
    )
    expect(insertCalls.length).toBe(2)
    // Last lane (index 1) gets is_done_col = 1
    const lastLaneArgs = insertCalls[1]
    // db.run(sql, projectId, name, position, is_done_col) → index 4 is is_done_col
    expect(lastLaneArgs[4]).toBe(1) // is_done_col argument
  })
})

// ─── GET /projects/:id ───────────────────────────────────────────────────────

describe('GET /projects/:id', () => {
  it('returns 400 for non-numeric id', async () => {
    const res = await makeApp().request('/projects/abc')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid id')
  })

  it('returns 404 when project not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/projects/99')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('project not found')
  })

  it('returns 200 with project and swim_lanes', async () => {
    const mockProject = { id: 1, name: 'Alpha', color: '#6366f1' }
    const mockLanes = [{ id: 1, name: 'Todo', position: 0 }]
    vi.mocked(db.get).mockResolvedValueOnce(mockProject)
    vi.mocked(db.all).mockResolvedValueOnce(mockLanes)

    const res = await makeApp().request('/projects/1')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toMatchObject({ id: 1, name: 'Alpha' })
    expect(body.data.swim_lanes).toEqual(mockLanes)
  })
})

// ─── PATCH /projects/:id ─────────────────────────────────────────────────────

describe('PATCH /projects/:id', () => {
  const patch = (id: string | number, body: unknown, user = ADMIN) =>
    makeApp(user).request(`/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 400 for non-numeric id', async () => {
    const res = await patch('abc', { name: 'X' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when project not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await patch(99, { name: 'X' })
    expect(res.status).toBe(404)
  })

  it('returns 403 when user lacks write access', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })   // project exists
    vi.mocked(canWrite).mockResolvedValueOnce(false)

    const res = await patch(1, { name: 'X' }, READER)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('forbidden')
  })

  it('returns 422 for invalid color hex', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    const res = await patch(1, { color: 'not-hex' })
    expect(res.status).toBe(422)
  })

  it('returns 200 with updated project', async () => {
    const updated = { id: 1, name: 'Renamed', color: '#6366f1' }
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 })   // exists check
      .mockResolvedValueOnce(updated)     // after update

    const res = await patch(1, { name: 'Renamed' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(updated)
  })

  it('skips UPDATE when no recognizable fields are in body', async () => {
    const unchanged = { id: 1, name: 'Same' }
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce(unchanged)

    const res = await patch(1, {}) // empty body — no sets built
    expect(res.status).toBe(200)
    // db.run should NOT have been called with UPDATE projects
    const updateCall = vi.mocked(db.run).mock.calls.find(
      c => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE projects')
    )
    expect(updateCall).toBeUndefined()
  })
})

// ─── DELETE /projects/:id ────────────────────────────────────────────────────

describe('DELETE /projects/:id', () => {
  it('returns 400 for non-numeric id', async () => {
    const res = await makeApp().request('/projects/abc', { method: 'DELETE' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when project not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/projects/1', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  it('returns 409 when trying to delete the Default Project', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, is_default: 1 })
    const res = await makeApp().request('/projects/1', { method: 'DELETE' })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('Default Project')
  })

  it('returns 200 with { id } on successful delete', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 5, is_default: 0 })
    const res = await makeApp().request('/projects/5', { method: 'DELETE' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ id: 5 })
    expect(body.error).toBeNull()
  })

  it('executes DELETE SQL with correct id', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 3, is_default: 0 })
    await makeApp().request('/projects/3', { method: 'DELETE' })
    expect(vi.mocked(db.run)).toHaveBeenCalledWith('DELETE FROM projects WHERE id = ?', 3)
  })
})
