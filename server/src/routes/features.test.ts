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
  canWrite:        vi.fn().mockResolvedValue(true),
  canRead:         vi.fn().mockResolvedValue(true),
  canManageUsers:  vi.fn().mockResolvedValue(false),
  getUserEpicRole: vi.fn().mockResolvedValue('contributor'),
}))

import { db } from '../db/index.js'
import { canWrite } from '../lib/epicAccess.js'
import features from './features'

const ADMIN  = { id: 1, role: 'super_admin',  email: 'admin@test.com', display_name: 'Admin' }
const READER = { id: 2, role: 'global_reader', email: 'user@test.com',  display_name: 'User'  }

function makeApp(user = ADMIN) {
  const app = new Hono()
  // @ts-ignore
  app.use('*', async (c, next) => { c.set('user', user); return next() })
  // @ts-ignore
  app.route('/', features)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.run).mockResolvedValue({ lastID: 1, changes: 1 })
  vi.mocked(db.all).mockResolvedValue([])
  vi.mocked(canWrite).mockResolvedValue(true)
})

// ─── GET /projects/:id/features ───────────────────────────────────────────────

describe('GET /projects/:id/features', () => {
  it('returns 400 for non-numeric project id', async () => {
    const res = await makeApp().request('/projects/abc/features')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid id')
  })

  it('returns 404 when project does not exist', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/projects/99/features')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('project not found')
  })

  it('returns 200 with all features for super_admin', async () => {
    const mockFeatures = [
      { id: 1, title: 'F1', story_count: 2, done_story_count: 1 },
      { id: 2, title: 'F2', story_count: 0, done_story_count: 0 },
    ]
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce(mockFeatures)

    const res = await makeApp(ADMIN).request('/projects/1/features')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(mockFeatures)
  })

  it('filters by epic_id when ?epic_id= query param provided', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce([{ id: 3, epic_id: 2, title: 'F3' }])

    const res = await makeApp(ADMIN).request('/projects/1/features?epic_id=2')
    expect(res.status).toBe(200)
    // Verify epic_id is included in the query parameters
    const allCall = vi.mocked(db.all).mock.calls[0]
    expect(allCall).toContain(2) // epic_id param
  })

  it('returns filtered features for non-super_admin based on epic access', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce([{ id: 1, title: 'Default F' }])

    const res = await makeApp(READER).request('/projects/1/features')
    expect(res.status).toBe(200)
    // Reader query includes user_id for access filter
    const allCall = vi.mocked(db.all).mock.calls[0]
    expect(allCall).toContain(READER.id)
  })
})

// ─── POST /projects/:id/features ─────────────────────────────────────────────

describe('POST /projects/:id/features', () => {
  const post = (projectId: string | number, body: unknown, user = ADMIN) =>
    makeApp(user).request(`/projects/${projectId}/features`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 400 for non-numeric project id', async () => {
    const res = await post('abc', { title: 'F1' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when project not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await post(99, { title: 'F1' })
    expect(res.status).toBe(404)
  })

  it('returns 422 for empty title string (triggers custom min message)', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    const res = await post(1, { title: '' })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toContain('title is required')
  })

  it('auto-resolves to default epic when epic_id is not provided', async () => {
    const newFeature = { id: 3, title: 'F1', epic_id: 5, story_count: 0 }
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 })           // project found
      .mockResolvedValueOnce({ id: 5 })            // default epic found
      .mockResolvedValueOnce({ m: 0 })             // max position
      .mockResolvedValueOnce(newFeature)           // SELECT after INSERT
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 3, changes: 1 })

    const res = await post(1, { title: 'F1' })
    expect(res.status).toBe(201)
    // Verify the default epic lookup was made
    const getCalls = vi.mocked(db.get).mock.calls
    const defaultEpicCall = getCalls.find(c =>
      typeof c[0] === 'string' && (c[0] as string).includes('is_default = 1')
    )
    expect(defaultEpicCall).toBeDefined()
  })

  it('returns 404 when provided epic_id does not belong to the project', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 })   // project found
      .mockResolvedValueOnce(undefined)   // epic not found in project

    const res = await post(1, { title: 'F1', epic_id: 999 })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toContain('epic not found in this project')
  })

  it('returns 403 when user lacks write access on the resolved epic', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 })    // project found
      .mockResolvedValueOnce({ id: 5 })    // default epic found
    vi.mocked(canWrite).mockResolvedValueOnce(false)

    const res = await post(1, { title: 'F1' }, READER)
    expect(res.status).toBe(403)
  })

  it('returns 201 with feature when epic_id is explicitly provided', async () => {
    const newFeature = { id: 4, title: 'Feature', epic_id: 2, story_count: 0, done_story_count: 0 }
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 })    // project found
      .mockResolvedValueOnce({ id: 2 })    // epic exists in project
      .mockResolvedValueOnce({ m: 2 })     // max position
      .mockResolvedValueOnce(newFeature)   // SELECT after INSERT
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 4, changes: 1 })

    const res = await post(1, { title: 'Feature', epic_id: 2 })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data).toEqual(newFeature)
  })
})

// ─── GET /features/:id ───────────────────────────────────────────────────────

describe('GET /features/:id', () => {
  it('returns 400 for non-numeric id', async () => {
    const res = await makeApp().request('/features/abc')
    expect(res.status).toBe(400)
  })

  it('returns 404 when feature not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/features/99')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('feature not found')
  })

  it('returns 200 with feature data (no access check — open to all authenticated users)', async () => {
    const feature = { id: 1, title: 'Feature A', story_count: 3, done_story_count: 1 }
    vi.mocked(db.get).mockResolvedValueOnce(feature)

    // READER can access — no canRead guard on GET /features/:id
    const res = await makeApp(READER).request('/features/1')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(feature)
    // canWrite should NOT have been called — no RBAC check on GET single
    expect(canWrite).not.toHaveBeenCalled()
  })
})

// ─── GET /features/:id/stories ───────────────────────────────────────────────

describe('GET /features/:id/stories', () => {
  it('returns 400 for non-numeric id', async () => {
    const res = await makeApp().request('/features/abc/stories')
    expect(res.status).toBe(400)
  })

  it('returns 404 when feature not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/features/99/stories')
    expect(res.status).toBe(404)
  })

  it('returns 200 with list of stories for the feature', async () => {
    const cards = [
      { id: 1, title: 'Story A', feature_id: 5 },
      { id: 2, title: 'Story B', feature_id: 5 },
    ]
    vi.mocked(db.get).mockResolvedValueOnce({ id: 5 })
    vi.mocked(db.all).mockResolvedValueOnce(cards)

    const res = await makeApp().request('/features/5/stories')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(cards)
  })
})

// ─── PATCH /features/:id ─────────────────────────────────────────────────────

describe('PATCH /features/:id', () => {
  const patch = (id: string | number, body: unknown, user = ADMIN) =>
    makeApp(user).request(`/features/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 400 for non-numeric id', async () => {
    const res = await patch('abc', { title: 'X' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when feature not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await patch(99, { title: 'X' })
    expect(res.status).toBe(404)
  })

  it('returns 403 when user lacks write access on the feature epic', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, project_id: 1, epic_id: 2 })
    vi.mocked(canWrite).mockResolvedValueOnce(false)

    const res = await patch(1, { title: 'X' }, READER)
    expect(res.status).toBe(403)
  })

  it('returns 400 when body has no updatable fields', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, project_id: 1, epic_id: 2 })
    vi.mocked(canWrite).mockResolvedValueOnce(true)

    const res = await patch(1, {})
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('no fields to update')
  })

  it('returns 404 when reassigned epic_id does not belong to the project', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, project_id: 1, epic_id: 2 })  // feature
      .mockResolvedValueOnce(undefined)                               // epic not in project
    vi.mocked(canWrite).mockResolvedValueOnce(true)

    const res = await patch(1, { epic_id: 999 })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toContain('epic not found in this project')
  })

  it('returns 200 with updated feature after title change', async () => {
    const updated = { id: 1, title: 'Renamed', story_count: 0, done_story_count: 0 }
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, project_id: 1, epic_id: null })
      .mockResolvedValueOnce(updated)
    // canWrite not called when epic_id is null

    const res = await patch(1, { title: 'Renamed' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(updated)
  })
})

// ─── DELETE /features/:id ─────────────────────────────────────────────────────

describe('DELETE /features/:id', () => {
  it('returns 400 for non-numeric id', async () => {
    const res = await makeApp().request('/features/abc', { method: 'DELETE' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when feature not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/features/99', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  it('returns 409 when trying to delete the default feature', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, is_default: 1, epic_id: 2 })
    const res = await makeApp().request('/features/1', { method: 'DELETE' })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('default feature')
  })

  it('returns 403 when user lacks write access', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, is_default: 0, epic_id: 2 })
    vi.mocked(canWrite).mockResolvedValueOnce(false)

    const res = await makeApp(READER).request('/features/1', { method: 'DELETE' })
    expect(res.status).toBe(403)
  })

  it('returns 200 with { id } on successful delete', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 5, is_default: 0, epic_id: null })
    const res = await makeApp().request('/features/5', { method: 'DELETE' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ id: 5 })
  })

  it('executes DELETE SQL with correct id', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 8, is_default: 0, epic_id: null })
    await makeApp().request('/features/8', { method: 'DELETE' })
    expect(vi.mocked(db.run)).toHaveBeenCalledWith('DELETE FROM features WHERE id = ?', 8)
  })
})
