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

vi.mock('../lib/buildUpdate.js', () => ({
  buildUpdate: vi.fn(),
}))

vi.mock('../lib/activityLog.js', () => ({
  logActivity: vi.fn(),
}))

import { db } from '../db/index.js'
import { buildUpdate } from '../lib/buildUpdate.js'
import { logActivity } from '../lib/activityLog.js'
import testcases from './testcases'

const ADMIN = { id: 1, role: 'super_admin', email: 'admin@test.com', display_name: 'Admin' }

function makeApp(user = ADMIN) {
  const app = new Hono()
  // @ts-ignore
  app.use('*', async (c, next) => { c.set('user', user); return next() })
  // @ts-ignore
  app.route('/', testcases)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.transaction).mockImplementation((fn: () => Promise<unknown>) => async () => fn())
  vi.mocked(db.run).mockResolvedValue({ lastID: 1, changes: 1 })
  vi.mocked(db.all).mockResolvedValue([])
  vi.mocked(buildUpdate).mockReturnValue(null)
  vi.mocked(logActivity).mockResolvedValue(undefined)
})

// ─── GET /projects/:id/test-suites ────────────────────────────────────────────

describe('GET /projects/:id/test-suites', () => {
  it('returns 400 for non-numeric project id', async () => {
    const res = await makeApp().request('/projects/abc/test-suites')
    expect(res.status).toBe(400)
  })

  it('returns 404 when project not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/projects/99/test-suites')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('project not found')
  })

  it('returns 200 with empty array when no suites exist', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce([])
    const res = await makeApp().request('/projects/1/test-suites')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
  })

  it('returns 200 with test suites ordered by id', async () => {
    const mockSuites = [
      { id: 1, project_id: 1, name: 'Suite A' },
      { id: 2, project_id: 1, name: 'Suite B' },
    ]
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce(mockSuites)
    const res = await makeApp().request('/projects/1/test-suites')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(mockSuites)
  })
})

// ─── POST /projects/:id/test-suites ───────────────────────────────────────────

describe('POST /projects/:id/test-suites', () => {
  const post = (projectId: string | number, body: unknown) =>
    makeApp().request(`/projects/${projectId}/test-suites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 400 for non-numeric project id', async () => {
    const res = await post('abc', { name: 'Suite' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when project not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await post(99, { name: 'Suite' })
    expect(res.status).toBe(404)
  })

  it('returns 422 when name is missing', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    const res = await post(1, { description: 'Desc' })
    expect(res.status).toBe(422)
  })

  it('returns 422 when name exceeds 200 characters', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    const longName = 'a'.repeat(201)
    const res = await post(1, { name: longName })
    expect(res.status).toBe(422)
  })

  it('returns 201 with created suite', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, project_id: 1, name: 'Test Suite', description: 'Test' })

    const res = await post(1, { name: 'Test Suite', description: 'Test' })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.name).toBe('Test Suite')
  })
})

// ─── PATCH /test-suites/:id ───────────────────────────────────────────────────

describe('PATCH /test-suites/:id', () => {
  const patch = (suiteId: string | number, body: unknown) =>
    makeApp().request(`/test-suites/${suiteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 400 for non-numeric suite id', async () => {
    const res = await patch('abc', { name: 'Updated' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when suite not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await patch(99, { name: 'Updated' })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('test suite not found')
  })

  it('returns 400 when no fields to update', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    const res = await patch(1, {})
    expect(res.status).toBe(400)
  })

  it('returns 200 when suite is updated', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, name: 'Updated Suite' })
    vi.mocked(buildUpdate).mockReturnValue({ sql: 'name = ?, updated_at = datetime(\'now\')', params: ['Updated Suite'] })

    const res = await patch(1, { name: 'Updated Suite' })
    expect(res.status).toBe(200)
  })
})

// ─── DELETE /test-suites/:id ──────────────────────────────────────────────────

describe('DELETE /test-suites/:id', () => {
  it('returns 400 for non-numeric suite id', async () => {
    const res = await makeApp().request('/test-suites/abc', { method: 'DELETE' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when suite not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/test-suites/99', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  it('returns 200 when suite is deleted and orphans test cases', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.run).mockResolvedValueOnce({ changes: 1 })

    const res = await makeApp().request('/test-suites/1', { method: 'DELETE' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.id).toBe(1)
  })
})

// ─── GET /cards/:id/test-cases ────────────────────────────────────────────────

describe('GET /cards/:id/test-cases', () => {
  it('returns 400 for non-numeric card id', async () => {
    const res = await makeApp().request('/cards/abc/test-cases')
    expect(res.status).toBe(400)
  })

  it('returns 404 when card not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/cards/99/test-cases')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('card not found')
  })

  it('returns 200 with empty cases and summary when no test cases exist', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce([])
    const res = await makeApp().request('/cards/1/test-cases')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.cases).toEqual([])
    expect(body.data.summary).toEqual({
      total: 0,
      passed: 0,
      failed: 0,
      untested: 0,
      blocked: 0,
      skipped: 0,
    })
  })

  it('returns 200 with test cases and summary counts', async () => {
    const mockCases = [
      { id: 1, status: 'passed', steps: null, latest_run_id: null },
      { id: 2, status: 'failed', steps: null, latest_run_id: null },
      { id: 3, status: 'untested', steps: null, latest_run_id: null },
    ]
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce(mockCases as any)
    const res = await makeApp().request('/cards/1/test-cases')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.summary.passed).toBe(1)
    expect(body.data.summary.failed).toBe(1)
    expect(body.data.summary.untested).toBe(1)
  })
})

// ─── POST /cards/:id/test-cases ───────────────────────────────────────────────

describe('POST /cards/:id/test-cases', () => {
  const post = (cardId: string | number, body: unknown) =>
    makeApp().request(`/cards/${cardId}/test-cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 400 for non-numeric card id', async () => {
    const res = await post('abc', { title: 'Test' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when card not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await post(99, { title: 'Test' })
    expect(res.status).toBe(404)
  })

  it('returns 422 when title is missing', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, swim_lane_id: 1, column_id: null })
      .mockResolvedValueOnce({ project_id: 10 })
    const res = await post(1, { description: 'Desc' })
    expect(res.status).toBe(422)
  })

  it('returns 201 with created test case using defaults', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, swim_lane_id: 1, column_id: null })
      .mockResolvedValueOnce({ project_id: 10 })
      .mockResolvedValueOnce({ m: 0 })
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, title: 'Test Case', status: 'untested', steps: null })

    const res = await post(1, { title: 'Test Case' })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.title).toBe('Test Case')
  })

  it('returns 404 when suite_id does not belong to project', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, swim_lane_id: 1, column_id: null })
      .mockResolvedValueOnce({ project_id: 10 })
      .mockResolvedValueOnce(undefined) // suite not found in project
    const res = await post(1, { title: 'Test', suite_id: 99 })
    expect(res.status).toBe(404)
  })
})

// ─── GET /test-cases/:id ──────────────────────────────────────────────────────

describe('GET /test-cases/:id', () => {
  it('returns 400 for non-numeric test case id', async () => {
    const res = await makeApp().request('/test-cases/abc')
    expect(res.status).toBe(400)
  })

  it('returns 404 when test case not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/test-cases/99')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('test case not found')
  })

  it('returns 200 with test case and runs', async () => {
    const mockCase = { id: 1, title: 'Test', steps: null }
    const mockRuns = [{ id: 1, status: 'passed' }]
    vi.mocked(db.get).mockResolvedValueOnce(mockCase as any)
    vi.mocked(db.all).mockResolvedValueOnce(mockRuns)
    const res = await makeApp().request('/test-cases/1')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.id).toBe(1)
    expect(body.data.runs).toEqual(mockRuns)
  })
})

// ─── POST /test-cases/:id/runs ────────────────────────────────────────────────

describe('POST /test-cases/:id/runs', () => {
  const post = (testCaseId: string | number, body: unknown) =>
    makeApp().request(`/test-cases/${testCaseId}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 400 for non-numeric test case id', async () => {
    const res = await post('abc', { status: 'passed' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when test case not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await post(99, { status: 'passed' })
    expect(res.status).toBe(404)
  })

  it('returns 422 when status is missing', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, title: 'Test', card_id: 5 })
    const res = await post(1, { notes: 'Failed' })
    expect(res.status).toBe(422)
  })

  it('returns 201 with created test run', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, title: 'Test', card_id: 5 })
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, status: 'passed' })

    const res = await post(1, { status: 'passed', notes: 'All good' })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.status).toBe('passed')
  })
})

// ─── POST /cards/:id/test-cases/reorder ───────────────────────────────────────

describe('POST /cards/:id/test-cases/reorder', () => {
  const post = (cardId: string | number, body: unknown) =>
    makeApp().request(`/cards/${cardId}/test-cases/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 400 for non-numeric card id', async () => {
    const res = await post('abc', { ordered_ids: [1, 2] })
    expect(res.status).toBe(400)
  })

  it('returns 404 when card not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await post(99, { ordered_ids: [1, 2] })
    expect(res.status).toBe(404)
  })

  it('returns 422 when ordered_ids is empty', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    const res = await post(1, { ordered_ids: [] })
    expect(res.status).toBe(422)
  })

  it('returns 400 when test case id does not belong to card', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
    const res = await post(1, { ordered_ids: [1, 99] })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('one or more test case ids do not belong to this card')
  })

  it('returns 200 with reordered test cases', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all)
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
      .mockResolvedValueOnce([{ id: 2, position: 0, steps: null }, { id: 1, position: 1, steps: null }])
    vi.mocked(db.run).mockResolvedValueOnce({ changes: 1 })

    const res = await post(1, { ordered_ids: [2, 1] })
    expect(res.status).toBe(200)
  })
})

// ─── PATCH /cards/:id/test-cases/bulk-status ──────────────────────────────────

describe('PATCH /cards/:id/test-cases/bulk-status', () => {
  const patch = (cardId: string | number, body: unknown) =>
    makeApp().request(`/cards/${cardId}/test-cases/bulk-status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 400 for non-numeric card id', async () => {
    const res = await patch('abc', { ids: [1], status: 'passed' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when card not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await patch(99, { ids: [1], status: 'passed' })
    expect(res.status).toBe(404)
  })

  it('returns 422 when ids is empty', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    const res = await patch(1, { ids: [], status: 'passed' })
    expect(res.status).toBe(422)
  })

  it('returns 400 when test case id does not belong to card', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce([{ id: 1 }])
    const res = await patch(1, { ids: [1, 99], status: 'passed' })
    expect(res.status).toBe(400)
  })

  it('returns 200 with updated test cases', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all)
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
      .mockResolvedValueOnce([
        { id: 1, status: 'passed', steps: null },
        { id: 2, status: 'passed', steps: null },
      ])
    vi.mocked(db.run).mockResolvedValueOnce({ changes: 2 })

    const res = await patch(1, { ids: [1, 2], status: 'passed' })
    expect(res.status).toBe(200)
  })
})

// ─── GET /projects/:id/test-cases ─────────────────────────────────────────────

describe('GET /projects/:id/test-cases', () => {
  it('returns 400 for non-numeric project id', async () => {
    const res = await makeApp().request('/projects/abc/test-cases')
    expect(res.status).toBe(400)
  })

  it('returns 404 when project not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/projects/99/test-cases')
    expect(res.status).toBe(404)
  })

  describe('query param validation', () => {
    it('rejects invalid status value — returns 422', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
      const res = await makeApp().request('/projects/1/test-cases?status=invalid')
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.error).toBeDefined()
    })

    it('rejects invalid priority value — returns 422', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
      const res = await makeApp().request('/projects/1/test-cases?priority=bad')
      expect(res.status).toBe(422)
    })

    it('rejects invalid test_type value — returns 422', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
      const res = await makeApp().request('/projects/1/test-cases?test_type=wrong')
      expect(res.status).toBe(422)
    })

    it('accepts valid status filter — returns 200', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
      vi.mocked(db.get).mockResolvedValueOnce({ total: 0 })
      vi.mocked(db.all).mockResolvedValueOnce([])
      const res = await makeApp().request('/projects/1/test-cases?status=passed')
      expect(res.status).toBe(200)
    })
  })

  it('returns 200 with all test cases for project', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 }) // project exists
      .mockResolvedValueOnce({ total: 1 }) // COUNT query
    vi.mocked(db.all).mockResolvedValueOnce([
      { id: 1, status: 'passed', card_title: 'Card 1', steps: null, latest_run_id: null },
    ])
    const res = await makeApp().request('/projects/1/test-cases')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.items).toBeDefined()
    expect(Array.isArray(body.data.items)).toBe(true)
    expect(body.data.total).toBe(1)
  })

  it('supports suite_id filter query param', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ total: 0 })
    vi.mocked(db.all).mockResolvedValueOnce([])
    const res = await makeApp().request('/projects/1/test-cases?suite_id=5')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.items).toBeDefined()
  })
})
