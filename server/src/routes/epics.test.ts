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

vi.mock('../lib/epicAccess.js', () => ({
  canRead:        vi.fn().mockResolvedValue(true),
  canWrite:       vi.fn().mockResolvedValue(true),
  canManageUsers: vi.fn().mockResolvedValue(false),
  getUserEpicRole: vi.fn().mockResolvedValue('contributor'),
}))

import { db } from '../db/index.js'
import { canRead, canWrite } from '../lib/epicAccess.js'
import epics from './epics'

const ADMIN  = { id: 1, role: 'super_admin',  email: 'admin@test.com', display_name: 'Admin' }
const READER = { id: 2, role: 'global_reader', email: 'user@test.com',  display_name: 'User'  }

function makeApp(user = ADMIN) {
  const app = new Hono()
  // @ts-ignore
  app.use('*', async (c, next) => { c.set('user', user); return next() })
  // @ts-ignore
  app.route('/', epics)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.run).mockResolvedValue({ lastID: 1, changes: 1 })
  vi.mocked(db.all).mockResolvedValue([])
  vi.mocked(canRead).mockResolvedValue(true)
  vi.mocked(canWrite).mockResolvedValue(true)
})

// ─── GET /projects/:id/epics ──────────────────────────────────────────────────

describe('GET /projects/:id/epics', () => {
  it('returns 400 for non-numeric project id', async () => {
    const res = await makeApp().request('/projects/abc/epics')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid id')
  })

  it('returns 404 when project does not exist', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/projects/1/epics')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('project not found')
  })

  it('super_admin sees all epics (no access filter in SQL)', async () => {
    const mockEpics = [
      { id: 1, title: 'Default', is_default: 1, feature_count: 2, story_count: 5 },
      { id: 2, title: 'Epic A',  is_default: 0, feature_count: 0, story_count: 0 },
    ]
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })  // project found
    vi.mocked(db.all).mockResolvedValueOnce(mockEpics)

    const res = await makeApp(ADMIN).request('/projects/1/epics')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(mockEpics)
    // Super admin query has no user_id parameter
    const allCall = vi.mocked(db.all).mock.calls[0]
    expect(allCall.length).toBe(2) // only projectId param, no userId
  })

  it('global_reader sees only default or accessible epics (filtered query)', async () => {
    const filteredEpics = [{ id: 1, title: 'Default', is_default: 1 }]
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce(filteredEpics)

    const res = await makeApp(READER).request('/projects/1/epics')
    expect(res.status).toBe(200)
    // Reader query includes userId as second param for access filter
    const allCall = vi.mocked(db.all).mock.calls[0]
    expect(allCall[2]).toBe(READER.id) // userId param passed
  })
})

// ─── POST /projects/:id/epics ─────────────────────────────────────────────────

describe('POST /projects/:id/epics', () => {
  const post = (projectId: string | number, body: unknown, user = ADMIN) =>
    makeApp(user).request(`/projects/${projectId}/epics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 403 when user is not super_admin', async () => {
    const res = await post(1, { title: 'New Epic' }, READER)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('forbidden')
  })

  it('returns 400 for non-numeric project id', async () => {
    const res = await post('abc', { title: 'New Epic' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when project not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await post(99, { title: 'New Epic' })
    expect(res.status).toBe(404)
  })

  it('returns 422 for empty title string (triggers custom min message)', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    const res = await post(1, { title: '' })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toContain('title is required')
  })

  it('returns 422 for invalid priority value', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    const res = await post(1, { title: 'X', priority: 'critical' })
    expect(res.status).toBe(422)
  })

  it('returns 201 with created epic including feature_count and story_count', async () => {
    const newEpic = { id: 5, title: 'Big Feature', project_id: 1, feature_count: 0, story_count: 0 }
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 })     // project found
      .mockResolvedValueOnce({ m: 3 })      // MAX position
      .mockResolvedValueOnce(newEpic)       // SELECT after INSERT
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 5, changes: 1 })

    const res = await post(1, { title: 'Big Feature' })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data).toEqual(newEpic)
    expect(body.error).toBeNull()
  })
})

// ─── GET /epics/:id ───────────────────────────────────────────────────────────

describe('GET /epics/:id', () => {
  it('returns 400 for non-numeric id', async () => {
    const res = await makeApp().request('/epics/abc')
    expect(res.status).toBe(400)
  })

  it('returns 404 when epic not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/epics/99')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('epic not found')
  })

  it('returns 403 when user lacks read access', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, title: 'Epic' })
    vi.mocked(canRead).mockResolvedValueOnce(false)

    const res = await makeApp(READER).request('/epics/1')
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('forbidden')
  })

  it('returns 200 with epic data when access is granted', async () => {
    const epic = { id: 1, title: 'Epic A', feature_count: 2, story_count: 8 }
    vi.mocked(db.get).mockResolvedValueOnce(epic)
    vi.mocked(canRead).mockResolvedValueOnce(true)

    const res = await makeApp().request('/epics/1')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(epic)
  })
})

// ─── PATCH /epics/:id ────────────────────────────────────────────────────────

describe('PATCH /epics/:id', () => {
  const patch = (id: string | number, body: unknown, user = ADMIN) =>
    makeApp(user).request(`/epics/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 400 for non-numeric epic id', async () => {
    const res = await patch('abc', { title: 'X' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when epic not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await patch(99, { title: 'X' })
    expect(res.status).toBe(404)
  })

  it('returns 403 when user lacks write access', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(canWrite).mockResolvedValueOnce(false)

    const res = await patch(1, { title: 'X' }, READER)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('forbidden')
  })

  it('returns 400 when no updatable fields in body', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(canWrite).mockResolvedValueOnce(true)

    const res = await patch(1, {})
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('no fields to update')
  })

  it('returns 422 for invalid priority value', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(canWrite).mockResolvedValueOnce(true)

    const res = await patch(1, { priority: 'urgent' })
    expect(res.status).toBe(422)
  })

  it('returns 200 with updated epic after title change', async () => {
    const updated = { id: 1, title: 'Updated Title', feature_count: 1, story_count: 3 }
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 })   // existing
      .mockResolvedValueOnce(updated)     // after update
    vi.mocked(canWrite).mockResolvedValueOnce(true)

    const res = await patch(1, { title: 'Updated Title' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(updated)
  })

  it('accepts nullable assignee and date fields', async () => {
    const updated = { id: 1, title: 'T', assignee: null, start_date: null, end_date: null }
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce(updated)
    vi.mocked(canWrite).mockResolvedValueOnce(true)

    const res = await patch(1, { assignee: null, start_date: null })
    expect(res.status).toBe(200)
  })
})

// ─── DELETE /epics/:id ────────────────────────────────────────────────────────

describe('DELETE /epics/:id', () => {
  it('returns 403 when user is not super_admin', async () => {
    const res = await makeApp(READER).request('/epics/1', { method: 'DELETE' })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('forbidden')
  })

  it('returns 400 for non-numeric id', async () => {
    const res = await makeApp().request('/epics/abc', { method: 'DELETE' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when epic not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/epics/99', { method: 'DELETE' })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('epic not found')
  })

  it('returns 409 when trying to delete the default epic', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, is_default: 1 })
    const res = await makeApp().request('/epics/1', { method: 'DELETE' })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('default epic')
  })

  it('returns 200 with { id } on successful delete', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 3, is_default: 0 })
    const res = await makeApp().request('/epics/3', { method: 'DELETE' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ id: 3 })
    expect(body.error).toBeNull()
  })

  it('executes DELETE SQL with correct id', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 7, is_default: 0 })
    await makeApp().request('/epics/7', { method: 'DELETE' })
    expect(vi.mocked(db.run)).toHaveBeenCalledWith('DELETE FROM epics WHERE id = ?', 7)
  })
})
