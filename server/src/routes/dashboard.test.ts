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
import dashboard from './dashboard'

const ADMIN = { id: 1, role: 'super_admin', email: 'admin@test.com', display_name: 'Admin' }

function makeApp(user = ADMIN) {
  const app = new Hono()
  // @ts-ignore
  app.use('*', async (c, next) => { c.set('user', user); return next() })
  // @ts-ignore
  app.route('/', dashboard)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ─── GET /dashboard/stats ────────────────────────────────────────────────────

describe('GET /dashboard/stats', () => {
  it('returns 200 with all stats counts', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ n: 5 })      // total projects
      .mockResolvedValueOnce({ n: 2 })      // active sprints
      .mockResolvedValueOnce({ n: 15 })     // open cards
      .mockResolvedValueOnce({ n: 50 })     // test cases total
      .mockResolvedValueOnce({ n: 30 })     // test cases passed
      .mockResolvedValueOnce({ n: 10 })     // test cases failed
      .mockResolvedValueOnce({ n: 10 })     // test cases untested

    const res = await makeApp().request('/dashboard/stats')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.total_projects).toBe(5)
    expect(body.data.active_sprints).toBe(2)
    expect(body.data.open_cards).toBe(15)
    expect(body.data.test_cases_total).toBe(50)
    expect(body.data.test_cases_passed).toBe(30)
    expect(body.data.test_cases_failed).toBe(10)
    expect(body.data.test_cases_untested).toBe(10)
  })

  it('includes user role in response', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ n: 0 })
      .mockResolvedValueOnce({ n: 0 })
      .mockResolvedValueOnce({ n: 0 })
      .mockResolvedValueOnce({ n: 0 })
      .mockResolvedValueOnce({ n: 0 })
      .mockResolvedValueOnce({ n: 0 })
      .mockResolvedValueOnce({ n: 0 })

    const res = await makeApp(ADMIN).request('/dashboard/stats')
    const body = await res.json()
    expect(body.data.user_role).toBe('super_admin')
  })

  it('defaults to 0 when counts are null', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)

    const res = await makeApp().request('/dashboard/stats')
    const body = await res.json()
    expect(body.data.total_projects).toBe(0)
    expect(body.data.active_sprints).toBe(0)
    expect(body.data.open_cards).toBe(0)
  })
})

// ─── GET /dashboard/projects ──────────────────────────────────────────────────

describe('GET /dashboard/projects', () => {
  it('returns 200 with empty array when no projects exist', async () => {
    vi.mocked(db.all).mockResolvedValueOnce([])
    const res = await makeApp().request('/dashboard/projects')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
  })

  it('returns projects with lane data', async () => {
    const mockProjects = [
      { id: 1, name: 'Project A', description: 'Desc A', color: '#ff0000', created_at: '2024-01-01' },
    ]
    const mockLanes = [
      { id: 1, name: 'To Do', color: '#000000', position: 0, is_done_col: 0, card_count: 5 },
      { id: 2, name: 'Done', color: '#00ff00', position: 1, is_done_col: 1, card_count: 3 },
    ]
    vi.mocked(db.all)
      .mockResolvedValueOnce(mockProjects)
      .mockResolvedValueOnce(mockLanes)      // swim_lanes for project 1
      .mockResolvedValueOnce(null)            // no active sprint
      .mockResolvedValueOnce({ test_cases_total: 10, test_cases_passed: 7, test_cases_failed: 2, test_cases_untested: 1 })

    const res = await makeApp().request('/dashboard/projects')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data[0].id).toBe(1)
    expect(body.data[0].lanes.length).toBe(2)
  })

  it('calculates total_cards and open_cards from lanes', async () => {
    const mockProjects = [
      { id: 1, name: 'Project A', description: '', color: '#000000', created_at: '2024-01-01' },
    ]
    const mockLanes = [
      { id: 1, name: 'Todo', color: '#000000', position: 0, is_done_col: 0, card_count: 5 },
      { id: 2, name: 'Done', color: '#000000', position: 1, is_done_col: 1, card_count: 3 },
    ]
    vi.mocked(db.all)
      .mockResolvedValueOnce(mockProjects)
      .mockResolvedValueOnce(mockLanes)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ test_cases_total: 0, test_cases_passed: 0, test_cases_failed: 0, test_cases_untested: 0 })

    const res = await makeApp().request('/dashboard/projects')
    const body = await res.json()
    expect(body.data[0].total_cards).toBe(8) // 5 + 3
    expect(body.data[0].open_cards).toBe(5)  // only non-done lane
  })

  it('includes active sprint if one exists', async () => {
    const mockProjects = [
      { id: 1, name: 'Project A', description: '', color: '#000000', created_at: '2024-01-01' },
    ]
    const mockLanes = []
    const mockColumns = []
    const mockSprint = { id: 1, project_id: 1, name: 'Sprint 1', goal: 'Build feature', start_date: '2024-01-01', end_date: '2024-01-15', status: 'active' }

    vi.mocked(db.all)
      .mockResolvedValueOnce(mockProjects)
      .mockResolvedValueOnce([])              // no swim lanes
      .mockResolvedValueOnce(mockColumns)    // try legacy columns
      .mockResolvedValueOnce(null)            // get active sprint
      .mockResolvedValueOnce({ test_cases_total: 0, test_cases_passed: 0, test_cases_failed: 0, test_cases_untested: 0 })

    vi.mocked(db.get).mockResolvedValueOnce(mockSprint)

    const res = await makeApp().request('/dashboard/projects')
    const body = await res.json()
    expect(body.data[0].active_sprint).toEqual(mockSprint)
  })

  it('falls back to legacy columns if no swim_lanes exist', async () => {
    const mockProjects = [
      { id: 1, name: 'Project A', description: '', color: '#000000', created_at: '2024-01-01' },
    ]
    vi.mocked(db.all)
      .mockResolvedValueOnce(mockProjects)
      .mockResolvedValueOnce([])              // no swim lanes
      .mockResolvedValueOnce([
        { id: 1, name: 'Col1', color: '#000000', position: 0, is_done_col: 0, card_count: 3 },
      ])
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ test_cases_total: 0, test_cases_passed: 0, test_cases_failed: 0, test_cases_untested: 0 })

    const res = await makeApp().request('/dashboard/projects')
    const body = await res.json()
    expect(body.data[0].lanes.length).toBeGreaterThan(0)
  })
})

// ─── GET /dashboard/activity ──────────────────────────────────────────────────

describe('GET /dashboard/activity', () => {
  it('returns 200 with empty array when no activity exists', async () => {
    vi.mocked(db.all).mockResolvedValueOnce([])
    const res = await makeApp().request('/dashboard/activity')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
  })

  it('returns 200 with recent project activity', async () => {
    const mockActivity = [
      {
        id: 1,
        card_id: 1,
        action: 'create',
        meta: '{}',
        created_at: '2024-01-01',
        card_title: 'New Card',
        project_id: 1,
        project_name: 'Project A',
      },
    ]
    vi.mocked(db.all).mockResolvedValueOnce(mockActivity)

    const res = await makeApp().request('/dashboard/activity')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(mockActivity)
  })

  it('limits activity to 10 most recent entries', async () => {
    const mockActivity = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      card_id: 1,
      action: 'update',
      meta: '{}',
      created_at: '2024-01-01',
      card_title: `Card ${i + 1}`,
      project_id: 1,
      project_name: 'Project A',
    }))
    vi.mocked(db.all).mockResolvedValueOnce(mockActivity)

    const res = await makeApp().request('/dashboard/activity')
    const body = await res.json()
    expect(body.data.length).toBe(10)
  })

  it('includes project context for each activity entry', async () => {
    const mockActivity = [
      {
        id: 1,
        card_id: 1,
        action: 'create',
        meta: '{"swim_lane_id": 1}',
        created_at: '2024-01-01',
        card_title: 'Card A',
        project_id: 1,
        project_name: 'Project A',
      },
      {
        id: 2,
        card_id: 2,
        action: 'move',
        meta: '{"from_lane_id": 1, "to_lane_id": 2}',
        created_at: '2024-01-02',
        card_title: 'Card B',
        project_id: 2,
        project_name: 'Project B',
      },
    ]
    vi.mocked(db.all).mockResolvedValueOnce(mockActivity)

    const res = await makeApp().request('/dashboard/activity')
    const body = await res.json()
    expect(body.data[0].project_name).toBe('Project A')
    expect(body.data[1].project_name).toBe('Project B')
  })

  it('handles activity from both swim_lanes and columns', async () => {
    const mockActivity = [
      {
        id: 1,
        card_id: 1,
        action: 'create',
        meta: '{}',
        created_at: '2024-01-01',
        card_title: 'New Card',
        project_id: 1,
        project_name: 'Project A',
      },
    ]
    vi.mocked(db.all).mockResolvedValueOnce(mockActivity)

    const res = await makeApp().request('/dashboard/activity')
    expect(res.status).toBe(200)
    // Verify the query includes both swim_lanes and columns joins
    const call = vi.mocked(db.all).mock.calls[0][0]
    expect(call).toContain('swim_lanes')
    expect(call).toContain('columns')
  })
})
